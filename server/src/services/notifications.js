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

// Description lines ticked in the edit form start with DONE_MARK, items not ticked yet with
// OPEN_MARK (client/src/descriptionLines.js).
const DONE_MARK = '✅ ';
const OPEN_MARK = '☐ ';
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
    const strip = (t) => String(t || '').split('\n').map((l) => (l.startsWith(DONE_MARK) ? l.slice(DONE_MARK.length) : l.startsWith(OPEN_MARK) ? l.slice(OPEN_MARK.length) : l)).join('\n');
    if (strip(oldValue) === strip(newValue)) {
      const before = doneLines(oldValue);
      const ticked = doneLines(newValue).filter((l) => !before.includes(l));
      if (ticked.length) return `סומן כבוצע בתיאור: ${ticked.map((l) => `"${l}"`).join(', ')}`;
      if (before.some((l) => !doneLines(newValue).includes(l))) return 'הוסר סימון "בוצע" משורה בתיאור';
      return 'שורות בתיאור סומנו כפריטים לביצוע';
    }
    // not the whole text: it goes in one summary with the task's other changes
    return 'התיאור עודכן';
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

// Writes to the activity log and an in-app notification for the people recipientsFor picks for
// this change. No WhatsApp goes out here (Haim, 2026-10-26: not a message on every change): the
// changes wait until someone clicks "עדכן על שינויים" in the task window — sendPendingUpdate.
export async function logActivity({ task, userId, field, oldValue, newValue, eventType }) {
  await pool.query(
    `INSERT INTO task_activity_log (task_id, user_id, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [task.id, userId, field, oldValue, newValue]
  );

  const recipientIds = new Set(await recipientsFor(task, field, oldValue, newValue));
  recipientIds.delete(userId);
  for (const recipientId of recipientIds) {
    await pool.query(
      `INSERT INTO notifications (tenant_id, user_id, task_id, type, channel, payload)
       VALUES ($1, $2, $3, $4, 'in_app', $5)`,
      [task.tenant_id, recipientId, task.id, eventType, JSON.stringify({ field, oldValue, newValue })]
    );
  }
}

// A sent update is marked by an activity-log row of its own: the changes after the latest one are
// the ones still to tell people about. Changes before UPDATES_SINCE went out on their own when
// they were made, as did any before the task's last WhatsApp message (whatsapp_messages).
const UPDATE_SENT = 'whatsapp_update';
const UPDATES_SINCE = '2026-10-26T00:00:00Z';

// The task's changes since its last update, one per field, from what it was then to what it is
// now (a status changed twice counts once; changed and changed back doesn't count):
// [{ field, oldValue, newValue, actorIds, actorNames }], oldest first.
async function pendingChanges(task) {
  const { rows } = await pool.query(
    `SELECT l.field, l.old_value, l.new_value, l.user_id, u.name AS user_name
     FROM task_activity_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.task_id = $1 AND l.field <> $2
       AND l.changed_at > GREATEST(
         $3::timestamptz,
         (SELECT max(changed_at) FROM task_activity_log WHERE task_id = $1 AND field = $2),
         (SELECT max(created_at) FROM whatsapp_messages
          WHERE task_id = $1 AND event_type IN ('assigned', 'status_changed', 'field_changed'))
       )
     ORDER BY l.changed_at`,
    [task.id, UPDATE_SENT, UPDATES_SINCE]
  );
  const byField = new Map();
  for (const r of rows) {
    const c = byField.get(r.field) || { field: r.field, oldValue: r.old_value, actorIds: new Set(), actorNames: new Set() };
    c.newValue = r.new_value;
    if (r.user_id) c.actorIds.add(r.user_id);
    if (r.user_name) c.actorNames.add(r.user_name);
    byField.set(r.field, c);
  }
  return [...byField.values()].filter(
    (c) => c.field === 'created' || String(c.oldValue ?? '') !== String(c.newValue ?? '')
  );
}

// Who gets what for the pending changes: the same people the changes always went to (recipientsFor,
// minus whoever made each change). Someone the task was just handed to gets "הועברה לטיפולך"
// (assigned); everyone else gets "the task was updated" with every change in one summary.
// Returns { changes: [summary text], recipients: Map(userId → eventType), changedByName, changeSummary }.
async function planUpdate(task) {
  const changes = await pendingChanges(task);
  const recipients = new Map();
  for (const c of changes) {
    const handedOver = c.field === 'created' || c.field === 'assignees';
    for (const id of await recipientsFor(task, c.field, c.oldValue, c.newValue)) {
      if (c.actorIds.has(id)) continue;
      const was = recipients.get(id);
      if (handedOver) recipients.set(id, 'assigned');
      else if (was !== 'assigned') recipients.set(id, c.field === 'status' || was === 'status_changed' ? 'status_changed' : 'field_changed');
    }
  }
  const summaries = [];
  for (const c of changes) summaries.push(await describeChange(task.tenant_id, c.field, c.oldValue, c.newValue));
  const names = new Set(changes.flatMap((c) => [...c.actorNames]));
  return {
    changes: summaries,
    recipients,
    changedByName: [...names].join(', ') || 'מישהו',
    // one line: Meta refuses a template variable with a line break or a tab
    changeSummary: summaries.join(' · ').replace(/\s+/g, ' ').slice(0, 900),
  };
}

// For the button: what an update would say now and to whom, without sending.
// { changes: [summary text], recipients: [name] }
export async function previewPendingUpdate(task) {
  const plan = await planUpdate(task);
  const ids = [...plan.recipients.keys()];
  const { rows } = ids.length
    ? await pool.query('SELECT name FROM users WHERE id = ANY($1::uuid[]) ORDER BY name', [ids])
    : { rows: [] };
  return { changes: plan.changes, recipients: rows.map((r) => r.name) };
}

// "עדכן על שינויים": sends the WhatsApp update for the task's pending changes, then marks them as
// told — unless there was someone to tell and no message got through (no phone, Meta refused…),
// so a second click can try again. Returns { changes, recipientCount, whatsappMessages, sent }.
export async function sendPendingUpdate({ task, userId }) {
  const plan = await planUpdate(task);
  const recipientCount = plan.recipients.size;
  if (!plan.changes.length) return { changes: [], recipientCount, whatsappMessages: [], sent: false };
  const whatsappMessages = [];
  for (const [recipientId, eventType] of plan.recipients) {
    const message = await sendWhatsAppMessage({
      tenantId: task.tenant_id,
      userId: recipientId,
      eventType,
      task,
      extra: { changedByName: plan.changedByName, changeSummary: plan.changeSummary },
    });
    if (message) whatsappMessages.push(message);
  }
  const sent = whatsappMessages.some((m) => m.sent);
  if (sent || !recipientCount) {
    await pool.query(
      'INSERT INTO task_activity_log (task_id, user_id, field, old_value, new_value) VALUES ($1, $2, $3, NULL, $4)',
      [task.id, userId, UPDATE_SENT, plan.changeSummary]
    );
  }
  return { changes: plan.changes, recipientCount, whatsappMessages, sent };
}
