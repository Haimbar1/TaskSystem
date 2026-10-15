import { pool } from '../db.js';

// The "קישור למשימה" in a business's WhatsApp messages. A business that works inside Monday (the
// app embedded in a board view, see embed.js) points it at that board, so the link opens the app
// where its people already are — Monday asks them to log in if they aren't. Empty = the task
// system itself (CLIENT_URL). Set by the platform owner on the "הגדרות וואטסאפ" screen.

let columnReady = false;
async function ensureColumn() {
  if (columnReady) return;
  await pool.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS message_link_url TEXT');
  columnReady = true;
}

export function defaultMessageLink() {
  return `${process.env.CLIENT_URL || 'http://localhost:5173'}/`;
}

export async function getMessageLinkSetting(tenantId) {
  await ensureColumn();
  const { rows } = await pool.query('SELECT message_link_url FROM tenants WHERE id = $1', [tenantId]);
  return rows[0]?.message_link_url || '';
}

export async function messageLink(tenantId) {
  return (await getMessageLinkSetting(tenantId)) || defaultMessageLink();
}

// '' clears it (back to the default). Returns an error message for anything but an http(s) URL.
export async function setMessageLinkSetting(tenantId, value) {
  const url = String(value ?? '').trim();
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return 'הקישור אינו כתובת תקינה';
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) return 'הקישור חייב להתחיל ב-https://';
  }
  await ensureColumn();
  await pool.query('UPDATE tenants SET message_link_url = $1 WHERE id = $2', [url || null, tenantId]);
  return null;
}
