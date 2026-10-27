import { pool } from '../db.js';

// The outgoing WhatsApp log shown under the gear ("יומן הודעות וואטסאפ"). Meta only says
// "accepted" when we send; whether the message really reached the phone arrives later through
// its status webhook, forwarded by the messages system's n8n (routes/whatsappWebhookRoutes.js), which updates the row by wamid.

// Same as migrations/006_whatsapp_messages.sql (keep in sync), inlined so a serverless deploy
// creates the table on first use without reading files or running migrate.
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name TEXT,
  to_number TEXT,
  event_type TEXT,
  template_name TEXT,
  text TEXT,
  wamid TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_tenant_created ON whatsapp_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_wamid ON whatsapp_messages (wamid) WHERE wamid IS NOT NULL;`;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(CREATE_TABLE);
  tableReady = true;
}

// Meta's statuses can arrive out of order (read before delivered); never step back.
const RANK = { skipped: 0, accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

// Never throws: logging must not fail the task save that triggered the message.
export async function recordMessage(m) {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO whatsapp_messages
         (tenant_id, task_id, task_title, user_id, recipient_name, to_number, event_type, template_name, text, wamid, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        m.tenantId,
        m.taskId || null,
        m.taskTitle || null,
        m.userId || null,
        m.recipientName || null,
        m.to || null,
        m.eventType || null,
        m.templateName || null,
        m.text || null,
        m.wamid || null,
        m.status,
        m.error || null,
      ]
    );
  } catch (err) {
    console.error('WhatsApp log write failed', err?.message);
  }
}

function describeError(e) {
  if (!e) return null;
  const details = e.error_data?.details;
  return [e.code && `(${e.code})`, e.title || e.message, details && details !== e.title ? details : null]
    .filter(Boolean)
    .join(' ');
}

// Applies the `statuses` of a Meta webhook payload (entry[].changes[].value.statuses[]).
// Returns how many rows changed; wamids we didn't send (other systems' messages) are ignored.
export async function applyStatusWebhook(body) {
  const statuses = (body?.entry || []).flatMap((entry) =>
    (entry.changes || []).flatMap((change) => change.value?.statuses || [])
  );
  // Incoming chat messages are forwarded too; they have no statuses and need no DB work.
  if (!statuses.length) return 0;
  await ensureTable();
  let updated = 0;
  for (const s of statuses) {
    if (!s?.id || !(s.status in RANK)) continue;
    const { rowCount } = await pool.query(
      `UPDATE whatsapp_messages
       SET status = $2, error = COALESCE($3, error), updated_at = now()
       WHERE wamid = $1 AND $4 > CASE status
         WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'failed' THEN 5 ELSE 1 END`,
      [s.id, s.status, describeError(s.errors?.[0]), RANK[s.status]]
    );
    updated += rowCount;
  }
  return updated;
}

// Where the messages system's n8n workflow forwards Meta's webhook (whatsappWebhookRoutes.js).
export function statusForwardUrl(req) {
  return `${req.protocol}://${req.get('host')}/api/whatsapp/statuses`;
}

// Removes one row from the business's log ("פח" in the log screen). Returns whether it existed.
export async function deleteMessage(tenantId, id) {
  await ensureTable();
  const { rowCount } = await pool.query('DELETE FROM whatsapp_messages WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return rowCount > 0;
}

// `search` matches the recipient, task, message text, template and error. A phone typed the
// Israeli way (050-1234567) also matches the stored international number (972501234567).
export async function listMessages(tenantId, { search = '', limit = 200 } = {}) {
  await ensureTable();
  const params = [tenantId, limit];
  let where = 'tenant_id = $1';
  const q = search.trim();
  if (q) {
    const like = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(like(q));
    const conditions = [`recipient_name ILIKE $3`, `task_title ILIKE $3`, `text ILIKE $3`, `template_name ILIKE $3`, `error ILIKE $3`];
    const digits = q.replace(/[\s\-+()]/g, '');
    if (/^\d+$/.test(digits)) {
      params.push(like(digits.startsWith('0') ? `972${digits.slice(1)}` : digits));
      conditions.push(`to_number LIKE $4`);
    }
    where += ` AND (${conditions.join(' OR ')})`;
  }
  const { rows } = await pool.query(
    `SELECT id, task_id, task_title, recipient_name, to_number, event_type, template_name, text, status, error,
            created_at, updated_at
     FROM whatsapp_messages WHERE ${where}
     ORDER BY created_at DESC LIMIT $2`,
    params
  );
  return rows;
}
