import { pool } from '../db.js';
import { EMBED_USER_EMAIL, isEmbedUser } from '../embed.js';
import { PRIORITY_LABELS, FIELD_LABELS } from '../labels.js';
import { formatDate } from '../dateFormat.js';
import { getStatuses, statusLabel } from './taskStatuses.js';

// The business's action log ("יומן פעולות" under the gear): who did what — tasks created, changed
// and deleted, and changes to the business's settings and people. Each row keeps the names as they
// were (actor, task title), so it still reads right after a user or task is deleted.
//
// Inside Monday everyone shares one login (embed.js) and Monday doesn't tell an embedded page who's
// looking, so there the person picks "who am I" once per device and the client sends it as the
// X-Acting-User header. It's their own word, not a verified identity — the log marks those rows
// "דרך Monday". The pick is also kept in a year-long cookie (PUT /api/auth/acting-user), so it's
// remembered even where the iframe can't keep it in the browser's storage.
export const ACTING_USER_COOKIE = 'acting_user';
const COOKIE_ATTRS =
  process.env.NODE_ENV === 'production' ? 'Path=/; HttpOnly; Secure; SameSite=None' : 'Path=/; HttpOnly; SameSite=Lax';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cookieActingUser(req) {
  const match = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${ACTING_USER_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export function setActingUserCookie(res, userId) {
  res.setHeader(
    'Set-Cookie',
    userId
      ? `${ACTING_USER_COOKIE}=${userId}; Max-Age=${365 * 24 * 60 * 60}; ${COOKIE_ATTRS}`
      : `${ACTING_USER_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`
  );
}

// A person of the business (never the shared service user), or null.
export async function businessUser(tenantId, userId) {
  if (!UUID.test(String(userId || ''))) return null;
  const { rows } = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1 AND tenant_id = $2 AND email IS DISTINCT FROM $3',
    [userId, tenantId, EMBED_USER_EMAIL]
  );
  return rows[0] || null;
}

// Same as migrations/008_audit_log.sql (keep in sync), so a serverless deploy creates it on first use.
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  via_monday BOOLEAN NOT NULL DEFAULT false,
  action TEXT NOT NULL,
  task_id UUID,
  task_title TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_created ON audit_log (tenant_id, created_at DESC);`;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(CREATE_TABLE);
  tableReady = true;
}

// Who is acting on this request: the logged-in person, or — inside Monday — whoever was picked
// on this device (null userId when nobody was picked yet): the header, else the remembered cookie.
export async function actorFor(req) {
  if (!isEmbedUser(req.user)) {
    return { userId: req.user.id, name: req.user.name || req.user.email, viaMonday: false };
  }
  const tenantId = req.tenantId || req.user.tenant_id;
  for (const picked of [req.get('x-acting-user'), cookieActingUser(req)]) {
    const user = await businessUser(tenantId, picked);
    if (user) return { userId: user.id, name: user.name || user.email, viaMonday: true };
  }
  return { userId: null, name: null, viaMonday: true };
}

// Inside Monday, a change must say who made it: refuses it until "מי את/ה?" is picked.
export async function requireActor(req, res, next) {
  if (req.method === 'GET' || !isEmbedUser(req.user)) return next();
  try {
    req.actor = await actorFor(req);
    if (req.actor.userId) return next();
    res.status(400).json({ error: 'יש לבחור "מי את/ה?" כדי שיהיה ידוע מי ביצע את הפעולה', code: 'acting-user-required' });
  } catch (err) {
    next(err);
  }
}

// Never throws: the log must not fail the action it records.
export async function recordAction(req, { action, task = null, details = null }) {
  try {
    await ensureTable();
    const actor = req.actor || (await actorFor(req));
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, actor_name, via_monday, action, task_id, task_title, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.tenantId, actor.userId, actor.name, actor.viaMonday, action, task?.id || null, task?.title || null, details]
    );
  } catch (err) {
    console.error('Action log write failed', err?.message);
  }
}

export async function listActions(tenantId, limit = 300) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, user_id, actor_name, via_monday, action, task_id, task_title, details, created_at
     FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return rows;
}

const shorten = (text, max = 80) => (text.length > max ? `${text.slice(0, max)}…` : text);

// "סטטוס: בעבודה ← בוצע" — one line per changed task field, for the log.
export async function describeFieldChange(tenantId, field, oldValue, newValue) {
  let show = (v) => (v == null || v === '' ? '—' : shorten(String(v)));
  if (field === 'status') {
    const statuses = await getStatuses(tenantId);
    show = (v) => statusLabel(statuses, v);
  } else if (field === 'priority') {
    show = (v) => PRIORITY_LABELS[v] || v;
  } else if (field === 'due_date') {
    show = (v) => formatDate(v);
  }
  return `${FIELD_LABELS[field] || field}: ${show(oldValue)} ← ${show(newValue)}`;
}

export async function userNames(ids) {
  if (!ids?.length) return '—';
  const { rows } = await pool.query('SELECT name, email FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return rows.map((u) => u.name || u.email).join(', ') || '—';
}
