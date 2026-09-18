import { pool } from '../db.js';
import { buildWhatsAppMessage } from './whatsapp.js';
import { STATUS_LABELS, PRIORITY_LABELS, FIELD_LABELS } from '../labels.js';

function formatFieldValue(field, value) {
  if (value == null || value === '') return '—';
  if (field === 'status') return STATUS_LABELS[value] || value;
  if (field === 'priority') return PRIORITY_LABELS[value] || value;
  return String(value);
}

function describeChange(field, oldValue, newValue) {
  if (field === 'created') return 'המשימה נוצרה';
  if (field === 'assignees') return 'האחראים על המשימה עודכנו';
  const label = FIELD_LABELS[field] || field;
  return `${label} עודכן ל"${formatFieldValue(field, newValue)}"`;
}

// Writes to the activity log, then fans an in-app + WhatsApp notification out
// to everyone "involved" in the task: its creator, its assignees, and anyone
// already recorded as a watcher — minus whoever just made the change.
// Returns the list of WhatsApp message previews that were built for this
// event (see whatsapp.js — nothing is actually sent yet).
export async function logActivityAndNotify({ task, userId, field, oldValue, newValue, eventType }) {
  await pool.query(
    `INSERT INTO task_activity_log (task_id, user_id, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [task.id, userId, field, oldValue, newValue]
  );

  const { rows: actorRows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  const changedByName = actorRows[0]?.name || 'מישהו';
  const changeSummary = describeChange(field, oldValue, newValue);

  const { rows: involvedRows } = await pool.query(
    `SELECT user_id FROM task_assignees WHERE task_id = $1
     UNION SELECT user_id FROM task_watchers WHERE task_id = $1`,
    [task.id]
  );
  const recipientIds = new Set(involvedRows.map((r) => r.user_id));
  if (task.created_by) recipientIds.add(task.created_by);
  recipientIds.delete(userId);

  const previews = [];
  for (const recipientId of recipientIds) {
    await pool.query(
      `INSERT INTO notifications (tenant_id, user_id, task_id, type, channel, payload)
       VALUES ($1, $2, $3, $4, 'in_app', $5)`,
      [task.tenant_id, recipientId, task.id, eventType, JSON.stringify({ field, oldValue, newValue })]
    );
    const message = await buildWhatsAppMessage({
      tenantId: task.tenant_id,
      userId: recipientId,
      eventType,
      task,
      extra: { changedByName, changeSummary },
    });
    if (message) previews.push(message);
  }
  return previews;
}
