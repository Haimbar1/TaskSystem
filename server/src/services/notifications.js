import { pool } from '../db.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { PRIORITY_LABELS, FIELD_LABELS } from '../labels.js';
import { getStatuses, statusLabel } from './taskStatuses.js';

async function formatFieldValue(tenantId, field, value) {
  if (value == null || value === '') return '—';
  if (field === 'status') return statusLabel(await getStatuses(tenantId), value);
  if (field === 'priority') return PRIORITY_LABELS[value] || value;
  return String(value);
}

// Description lines ticked in the edit form start with this (client/src/descriptionLines.js).
const DONE_MARK = '✅ ';
const doneLines = (text) =>
  String(text || '')
    .split('\n')
    .filter((l) => l.startsWith(DONE_MARK))
    .map((l) => l.slice(DONE_MARK.length).trim());

async function describeChange(tenantId, field, oldValue, newValue) {
  if (field === 'created') return 'המשימה נוצרה';
  if (field === 'assignees') return 'האחראים על המשימה עודכנו';
  if (field === 'description') {
    // only lines ticked or unticked: say which, rather than repeating the whole text
    const strip = (t) => String(t || '').split('\n').map((l) => (l.startsWith(DONE_MARK) ? l.slice(DONE_MARK.length) : l)).join('\n');
    if (strip(oldValue) === strip(newValue)) {
      const before = doneLines(oldValue);
      const ticked = doneLines(newValue).filter((l) => !before.includes(l));
      if (ticked.length) return `סומן כבוצע בתיאור: ${ticked.map((l) => `"${l}"`).join(', ')}`;
      return 'הוסר סימון "בוצע" משורה בתיאור';
    }
  }
  const label = FIELD_LABELS[field] || field;
  return `${label} עודכן ל"${await formatFieldValue(tenantId, field, newValue)}"`;
}

// Who hears about a change (minus whoever made it). Nothing goes out while the task has no
// assignees. The rules are explained to people in client/src/views/WhatsAppSettingsView.jsx,
// whatsappTemplates.js (TEMPLATE_EVENTS) and the help assistant (crm/server/helpKnowledge.ts).
// - created / assignees changed: only the people newly assigned ("הועברה לטיפולך")
// - status: the assignees, the task's creator and its watchers
// - description: the assignees only
// - anything else (title, priority, due date): no one — it's only logged
async function recipientsFor(task, field, oldValue, newValue) {
  const { rows } = await pool.query('SELECT user_id FROM task_assignees WHERE task_id = $1', [task.id]);
  const assignees = rows.map((r) => r.user_id);
  if (!assignees.length) return [];
  if (field === 'created') return assignees;
  if (field === 'assignees') {
    const before = String(oldValue || '').split(',');
    return assignees.filter((id) => !before.includes(id));
  }
  if (field === 'description') return assignees;
  if (field === 'status') {
    const { rows: watcherRows } = await pool.query('SELECT user_id FROM task_watchers WHERE task_id = $1', [task.id]);
    const ids = new Set([...assignees, ...watcherRows.map((r) => r.user_id)]);
    if (task.created_by) ids.add(task.created_by);
    return [...ids];
  }
  return [];
}

// Writes to the activity log, then sends an in-app + WhatsApp notification to the people
// recipientsFor picks for this change. Returns the WhatsApp messages sent (see whatsapp.js).
export async function logActivityAndNotify({ task, userId, field, oldValue, newValue, eventType }) {
  await pool.query(
    `INSERT INTO task_activity_log (task_id, user_id, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [task.id, userId, field, oldValue, newValue]
  );

  const recipientIds = new Set(await recipientsFor(task, field, oldValue, newValue));
  recipientIds.delete(userId);
  if (!recipientIds.size) return [];

  const { rows: actorRows } = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  const changedByName = actorRows[0]?.name || 'מישהו';
  const changeSummary = await describeChange(task.tenant_id, field, oldValue, newValue);

  const messages = [];
  for (const recipientId of recipientIds) {
    await pool.query(
      `INSERT INTO notifications (tenant_id, user_id, task_id, type, channel, payload)
       VALUES ($1, $2, $3, $4, 'in_app', $5)`,
      [task.tenant_id, recipientId, task.id, eventType, JSON.stringify({ field, oldValue, newValue })]
    );
    const message = await sendWhatsAppMessage({
      tenantId: task.tenant_id,
      userId: recipientId,
      eventType,
      task,
      extra: { changedByName, changeSummary },
    });
    if (message) messages.push(message);
  }
  return messages;
}
