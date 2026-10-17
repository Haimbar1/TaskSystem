import { Router } from 'express';
import { pool } from '../db.js';
import { logActivityAndNotify } from '../services/notifications.js';
import { EMBED_USER_EMAIL, isEmbedUser } from '../embed.js';
import { takePendingTask } from './openTaskRoutes.js';
import { getStatuses, finalKeys } from '../services/taskStatuses.js';

const router = Router();
const SORTABLE = ['title', 'status', 'priority', 'due_date', 'completed_at', 'created_at'];

// GET /api/tasks?status=new&assignee=<userId>&sort=due_date&dir=asc
// TODO: per-column filtering beyond status/assignee (the table view needs it
// on every column per the spec) — extend the WHERE-building below.
router.get('/', async (req, res) => {
  const { id, status, assignee, sort = 'created_at', dir = 'desc' } = req.query;
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const params = [req.tenantId];
  let sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  // By the business's own status order (the Kanban columns), not alphabetically.
  if (sortCol === 'status') {
    params.push((await getStatuses(req.tenantId)).map((s) => s.key));
    sortCol = `array_position($${params.length}::text[], t.status)`;
  }
  let where = 'WHERE t.tenant_id = $1';
  if (id) {
    params.push(id);
    where += ` AND t.id = $${params.length}`;
  }
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

// The task a WhatsApp link asked to open (routes/openTaskRoutes.js), if it's in this business.
router.get('/pending-open', async (req, res) => {
  const taskId = takePendingTask(req, res);
  if (!taskId) return res.json({ taskId: null });
  const { rows } = await pool.query('SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2', [taskId, req.tenantId]);
  res.json({ taskId: rows[0]?.id || null });
});

router.post('/', async (req, res) => {
  const { title, description, priority = 'normal', due_date, assignee_ids = [] } = req.body;

  // Logged in through an embed (shared service user): the real creator is picked in the form, so
  // they're the one recorded (and notified on later changes) instead of the service user.
  let creatorId = req.user.id;
  if (isEmbedUser(req.user)) {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND email IS DISTINCT FROM $3',
      [req.body.created_by || null, req.tenantId, EMBED_USER_EMAIL]
    );
    if (!rows[0]) return res.status(400).json({ error: 'created_by is required' });
    creatorId = rows[0].id;
  }

  // New tasks open in the business's first status (never an ending one, see taskStatuses.js).
  const [firstStatus] = await getStatuses(req.tenantId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tasks (tenant_id, title, description, priority, due_date, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.tenantId, title, description, priority, due_date, creatorId, firstStatus.key]
    );
    const task = rows[0];
    for (const userId of assignee_ids) {
      await client.query(
        'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)',
        [task.id, userId]
      );
    }
    await client.query('COMMIT');
    const whatsappMessages = await logActivityAndNotify({
      task,
      userId: creatorId,
      field: 'created',
      oldValue: null,
      newValue: null,
      eventType: 'assigned',
    });
    res.status(201).json({ ...task, whatsappMessages });
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

  let finals = null;
  if (fields.status !== undefined) {
    const statuses = await getStatuses(req.tenantId);
    if (!statuses.some((s) => s.key === fields.status)) return res.status(400).json({ error: 'Unknown status' });
    finals = finalKeys(statuses);
  }

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
      // Completed = in an ending status (בוצע, נדחה…). Moving into one stamps the date; being in
      // any other status clears it, even if the task was completed before.
      if (finals) {
        if (!finals.includes(fields.status)) updates.push('completed_at = NULL');
        else if (!finals.includes(existing.status) || !existing.completed_at) updates.push('completed_at = now()');
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
    const whatsappMessages = [];
    for (const [key, value] of Object.entries(fields)) {
      if (String(existing[key]) !== String(value)) {
        const messages = await logActivityAndNotify({
          task: updated,
          userId: req.user.id,
          field: key,
          oldValue: existing[key],
          newValue: value,
          eventType: key === 'status' ? 'status_changed' : 'field_changed',
        });
        whatsappMessages.push(...messages);
      }
    }

    if (previousAssigneeIds !== null) {
      const changed =
        previousAssigneeIds.length !== assignee_ids.length ||
        !previousAssigneeIds.every((uid) => assignee_ids.includes(uid));
      if (changed) {
        const messages = await logActivityAndNotify({
          task: updated,
          userId: req.user.id,
          field: 'assignees',
          oldValue: previousAssigneeIds.join(','),
          newValue: assignee_ids.join(','),
          eventType: 'assigned',
        });
        whatsappMessages.push(...messages);
      }
    }

    const { rows: assigneeRows } = await pool.query(
      `SELECT u.id, u.name, u.email FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id WHERE ta.task_id = $1`,
      [id]
    );
    res.json({ ...updated, assignees: assigneeRows, whatsappMessages });
  } catch (err) {
    console.error('PATCH /api/tasks/:id failed:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  // task_assignees/task_watchers/task_activity_log/notifications/task_files
  // all have ON DELETE CASCADE on task_id (see migrations/001_init.sql), so
  // deleting the task row is enough.
  const { rows } = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, req.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

export default router;
