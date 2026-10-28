import express, { Router } from 'express';
import { pool } from '../db.js';
import { logActivity, previewPendingUpdate, sendPendingUpdate } from '../services/notifications.js';
import { EMBED_USER_EMAIL, isEmbedUser } from '../embed.js';
import { takePendingTask } from './openTaskRoutes.js';
import { getStatuses, finalKeys } from '../services/taskStatuses.js';
import { actorFor, recordAction, describeFieldChange, userNames } from '../services/auditLog.js';
import { listNotes, addNote } from '../services/taskNotes.js';
import {
  MAX_BYTES,
  listAttachments,
  addAttachment,
  getAttachment,
  deleteAttachment,
} from '../services/taskAttachments.js';
import { PRIORITY_LABELS } from '../labels.js';

const router = Router();
const SORTABLE = ['title', 'status', 'priority', 'due_date', 'completed_at', 'created_at'];

// The edit form sends every field back, so compare what it means: a DATE column comes back as a
// Date but is sent as "2026-09-14", and an empty description is null in one and '' in the other.
function sameValue(stored, sent) {
  const norm = (v) => {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    return String(v);
  };
  return norm(stored) === norm(sent);
}

// GET /api/tasks?status=new&assignee=<userId>&sort=due_date&dir=asc
// TODO: per-column filtering beyond status/assignee (the table view needs it
// on every column per the spec) — extend the WHERE-building below.
router.get('/', async (req, res) => {
  const { id, status, assignee, q, date_field, from, to, sort = 'created_at', dir = 'desc' } = req.query;
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
  // The search bar (components/TaskFilters.jsx): words in the title, description, notes or an
  // assignee's name, or (part of) the status or priority as it's shown…
  const text = String(q || '').trim();
  if (text) {
    params.push(`%${text.replace(/[\\%_]/g, '\\$&')}%`);
    const like = `$${params.length}`;
    const lower = text.toLowerCase();
    const shown = (labels) => labels.filter(([, label]) => label.toLowerCase().includes(lower)).map(([key]) => key);
    const statuses = await getStatuses(req.tenantId);
    params.push(shown(statuses.map((s) => [s.key, s.label])));
    const statusKeys = `$${params.length}`;
    params.push(shown(Object.entries(PRIORITY_LABELS)));
    const priorityKeys = `$${params.length}`;
    where += ` AND (t.title ILIKE ${like} OR t.description ILIKE ${like}
      OR EXISTS (SELECT 1 FROM task_notes n WHERE n.task_id = t.id AND n.body ILIKE ${like})
      OR EXISTS (SELECT 1 FROM task_assignees sa JOIN users su ON su.id = sa.user_id
                 WHERE sa.task_id = t.id AND su.name ILIKE ${like})
      OR t.status = ANY(${statusKeys}::text[]) OR t.priority::text = ANY(${priorityKeys}::text[]))`;
  }
  // …and a period (inclusive days, Israel time) on the chosen date.
  const dateCol = {
    due_date: 't.due_date',
    created_at: "(t.created_at AT TIME ZONE 'Asia/Jerusalem')::date",
    completed_at: "(t.completed_at AT TIME ZONE 'Asia/Jerusalem')::date",
  }[date_field] || 't.due_date';
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (isDay(from)) {
    params.push(from);
    where += ` AND ${dateCol} >= $${params.length}::date`;
  }
  if (isDay(to)) {
    params.push(to);
    where += ` AND ${dateCol} <= $${params.length}::date`;
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

// The task's notes ("הערות ביצוע"), oldest first; see services/taskNotes.js.
router.get('/:id/notes', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(await listNotes(rows[0].id));
});

// Adds a note signed by whoever is acting (inside Monday: the one picked in "מי את/ה?").
router.post('/:id/notes', async (req, res) => {
  const body = String(req.body?.body ?? '').trim();
  if (!body) return res.status(400).json({ error: 'ההערה ריקה' });
  const { rows } = await pool.query('SELECT id, title FROM tasks WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    req.tenantId,
  ]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: 'Not found' });
  req.actor = await actorFor(req);
  if (req.actor.viaMonday && !req.actor.userId) {
    return res.status(400).json({ error: 'יש לבחור למעלה "מי את/ה?" כדי שיהיה ידוע מי כתב את ההערה' });
  }
  const note = await addNote(task.id, req.actor, body);
  await recordAction(req, { action: 'note_added', task, details: body.length > 80 ? `${body.slice(0, 80)}…` : body });
  res.status(201).json(note);
});

// The task's files ("קבצים מצורפים"), oldest first, without their contents; see services/taskAttachments.js.
router.get('/:id/attachments', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(await listAttachments(rows[0].id));
});

// The file itself is the raw request body (always sent as application/octet-stream, so express.json
// never touches it — even a .json file); its name and type come in X-File-Name / X-File-Type.
router.post(
  '/:id/attachments',
  express.raw({ type: 'application/octet-stream', limit: MAX_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'הקובץ ריק' });
    let fileName = 'קובץ';
    try {
      fileName = decodeURIComponent(req.get('x-file-name') || '').trim().slice(0, 255) || fileName;
    } catch {}
    const mimeType = (req.get('x-file-type') || '').trim().slice(0, 120) || 'application/octet-stream';
    const { rows } = await pool.query('SELECT id, title FROM tasks WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      req.tenantId,
    ]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Not found' });
    req.actor = await actorFor(req);
    if (req.actor.viaMonday && !req.actor.userId) {
      return res.status(400).json({ error: 'יש לבחור למעלה "מי את/ה?" כדי שיהיה ידוע מי צירף את הקובץ' });
    }
    const attachment = await addAttachment(task.id, req.actor, { fileName, mimeType, data: req.body });
    await recordAction(req, { action: 'attachment_added', task, details: fileName });
    res.status(201).json(attachment);
  }
);

// Images and PDFs are served inline (thumbnails, opening in a tab); anything else only as a download,
// and nothing here may run as a page on the API's own site (an uploaded .html or .svg).
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|bmp|avif)|application\/pdf)$/i;
router.get('/:id/attachments/:attachmentId', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const file = await getAttachment(rows[0].id, req.params.attachmentId);
  if (!file) return res.status(404).json({ error: 'Not found' });
  const inline = INLINE_TYPES.test(file.mime_type);
  res.set({
    'Content-Type': inline ? file.mime_type : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=86400',
  });
  res.send(file.data);
});

router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const { rows } = await pool.query('SELECT id, title FROM tasks WHERE id = $1 AND tenant_id = $2', [
    req.params.id,
    req.tenantId,
  ]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: 'Not found' });
  const removed = await deleteAttachment(task.id, req.params.attachmentId);
  if (!removed) return res.status(404).json({ error: 'Not found' });
  await recordAction(req, { action: 'attachment_deleted', task, details: removed.file_name });
  res.status(204).end();
});

router.post('/', async (req, res) => {
  const { description, priority = 'normal', due_date, assignee_ids = [] } = req.body;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : req.body.title;

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
    // Inside Monday nobody may have picked "who am I" yet; the creator picked in the form did it.
    req.actor = await actorFor(req);
    if (req.actor.viaMonday && !req.actor.userId) {
      req.actor = { ...req.actor, userId: creatorId, name: await userNames([creatorId]) };
    }
    await recordAction(req, {
      action: 'task_created',
      task,
      details: assignee_ids.length ? `אחראים: ${await userNames(assignee_ids)}` : null,
    });
    await logActivity({
      task,
      userId: creatorId,
      field: 'created',
      oldValue: null,
      newValue: null,
      eventType: 'assigned',
    });
    res.status(201).json(task);
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
  if (typeof fields.title === 'string') fields.title = fields.title.trim();

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

    // Inside Monday: the person picked on this device, else the shared login (auditLog.js).
    req.actor = await actorFor(req);
    const actorId = req.actor.userId || req.user.id;

    // One activity-log entry per changed field. WhatsApp waits for "עדכן על שינויים"
    // (POST /:id/send-update below).
    for (const [key, value] of Object.entries(fields)) {
      if (!sameValue(existing[key], value)) {
        await recordAction(req, {
          action: 'task_updated',
          task: updated,
          details: await describeFieldChange(req.tenantId, key, existing[key], value),
        });
        await logActivity({
          task: updated,
          userId: actorId,
          field: key,
          oldValue: existing[key],
          newValue: value,
          eventType: key === 'status' ? 'status_changed' : 'field_changed',
        });
      }
    }

    if (previousAssigneeIds !== null) {
      const changed =
        previousAssigneeIds.length !== assignee_ids.length ||
        !previousAssigneeIds.every((uid) => assignee_ids.includes(uid));
      if (changed) {
        await recordAction(req, {
          action: 'task_updated',
          task: updated,
          details: `אחראים: ${await userNames(previousAssigneeIds)} ← ${await userNames(assignee_ids)}`,
        });
        await logActivity({
          task: updated,
          userId: actorId,
          field: 'assignees',
          oldValue: previousAssigneeIds.join(','),
          newValue: assignee_ids.join(','),
          eventType: 'assigned',
        });
      }
    }

    const { rows: assigneeRows } = await pool.query(
      `SELECT u.id, u.name, u.email FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id WHERE ta.task_id = $1`,
      [id]
    );
    res.json({ ...updated, assignees: assigneeRows });
  } catch (err) {
    console.error('PATCH /api/tasks/:id failed:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// The task window's "עדכן על שינויים": the changes since the last WhatsApp update and who'd get it…
router.get('/:id/pending-update', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(await previewPendingUpdate(rows[0]));
});

// …and sending it (services/notifications.js): { changes, recipientCount, whatsappMessages, sent }.
router.post('/:id/send-update', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: 'Not found' });
  req.actor = await actorFor(req);
  const result = await sendPendingUpdate({ task, userId: req.actor.userId || req.user.id });
  if (result.changes.length) {
    const sentTo = [...new Set(result.whatsappMessages.filter((m) => m.sent).map((m) => m.recipientName))];
    await recordAction(req, {
      action: 'task_updated',
      task,
      details: `עדכון וואטסאפ${sentTo.length ? ` נשלח אל: ${sentTo.join(', ')}` : ' — לא נשלח לאף אחד'}`,
    });
  }
  res.json(result);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  // task_assignees/task_watchers/task_activity_log/notifications/task_files
  // all have ON DELETE CASCADE on task_id (see migrations/001_init.sql), so
  // deleting the task row is enough.
  const { rows } = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND tenant_id = $2 RETURNING id, title',
    [id, req.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await recordAction(req, { action: 'task_deleted', task: rows[0] });
  res.status(204).end();
});

export default router;
