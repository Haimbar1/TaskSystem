import { Router } from 'express';
import { pool } from '../db.js';
import { logActivityAndNotify } from '../services/notifications.js';

const router = Router();
const SORTABLE = ['title', 'status', 'priority', 'due_date', 'completed_at', 'created_at'];

// GET /api/tasks?status=new&assignee=<userId>&sort=due_date&dir=asc
// TODO: per-column filtering beyond status/assignee (the table view needs it
// on every column per the spec) — extend the WHERE-building below.
router.get('/', async (req, res) => {
  const { status, assignee, sort = 'created_at', dir = 'desc' } = req.query;
  const sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const params = [req.tenantId];
  let where = 'WHERE t.tenant_id = $1';
  if (status) {
    params.push(status);
    where += ` AND t.status = $${params.length}`;
  }
  if (assignee) {
    params.push(assignee);
    where += ` AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = $${params.length})`;
  }

  const { rows } = await pool.query(
    `SELECT t.*,
       COALESCE(
         json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email))
         FILTER (WHERE u.id IS NOT NULL), '[]'
       ) AS assignees
     FROM tasks t
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     ${where}
     GROUP BY t.id
     ORDER BY ${sortCol} ${sortDir}`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { title, description, priority = 'normal', due_date, assignee_ids = [] } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tasks (tenant_id, title, description, priority, due_date, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'new') RETURNING *`,
      [req.tenantId, title, description, priority, due_date, req.user.id]
    );
    const task = rows[0];
    for (const userId of assignee_ids) {
      await client.query(
        'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)',
        [task.id, userId]
      );
    }
    await client.query('COMMIT');
    const whatsappPreviews = await logActivityAndNotify({
      task,
      userId: req.user.id,
      field: 'created',
      oldValue: null,
      newValue: null,
      eventType: 'assigned',
    });
    res.status(201).json({ ...task, whatsappPreviews });
  } catch (err) {
    console.error('POST /api/tasks failed:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
    return;
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { assignee_ids, ...fields } = req.body; // { status?, priority?, title?, description?, due_date?, assignee_ids? }

  const { rows: existingRows } = await pool.query(
    'SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2',
    [id, req.tenantId]
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const client = await pool.connect();
  let updated = existing;
  try {
    await client.query('BEGIN');

    if (Object.keys(fields).length > 0) {
      const updates = [];
      const params = [];
      let i = 1;
      for (const [key, value] of Object.entries(fields)) {
        updates.push(`${key} = $${i}`);
        params.push(value);
        i++;
      }
      if (fields.status === 'done' && existing.status !== 'done') {
        updates.push('completed_at = now()');
      }
      params.push(id, req.tenantId);

      const { rows } = await client.query(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = now()
         WHERE id = $${i} AND tenant_id = $${i + 1} RETURNING *`,
        params
      );
      updated = rows[0];
    }

    let previousAssigneeIds = null;
    if (Array.isArray(assignee_ids)) {
      const { rows: prevRows } = await client.query(
        'SELECT user_id FROM task_assignees WHERE task_id = $1',
        [id]
      );
      previousAssigneeIds = prevRows.map((r) => r.user_id);

      await client.query('DELETE FROM task_assignees WHERE task_id = $1', [id]);
      for (const userId of assignee_ids) {
        await client.query(
          'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)',
          [id, userId]
        );
      }
    }

    await client.query('COMMIT');

    // One activity-log entry (and one notification fan-out) per changed field —
    // status changes are what the spec calls out specifically, but every field
    // is logged the same way.
    const whatsappPreviews = [];
    for (const [key, value] of Object.entries(fields)) {
      if (String(existing[key]) !== String(value)) {
        const previews = await logActivityAndNotify({
          task: updated,
          userId: req.user.id,
          field: key,
          oldValue: existing[key],
          newValue: value,
          eventType: key === 'status' ? 'status_changed' : 'field_changed',
        });
        whatsappPreviews.push(...previews);
      }
    }

    if (previousAssigneeIds !== null) {
      const changed =
        previousAssigneeIds.length !== assignee_ids.length ||
        !previousAssigneeIds.every((uid) => assignee_ids.includes(uid));
      if (changed) {
        const previews = await logActivityAndNotify({
          task: updated,
          userId: req.user.id,
          field: 'assignees',
          oldValue: previousAssigneeIds.join(','),
          newValue: assignee_ids.join(','),
          eventType: 'assigned',
        });
        whatsappPreviews.push(...previews);
      }
    }

    const { rows: assigneeRows } = await pool.query(
      `SELECT u.id, u.name, u.email FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id WHERE ta.task_id = $1`,
      [id]
    );
    res.json({ ...updated, assignees: assigneeRows, whatsappPreviews });
  } catch (err) {
    console.error('PATCH /api/tasks/:id failed:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
