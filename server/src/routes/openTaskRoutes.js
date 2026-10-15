import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { messageLink } from '../services/messageLink.js';
import { getEmbedToken } from '../embed.js';

const router = Router();

// The "קישור למשימה" in WhatsApp messages. Both kinds note the task in a short-lived cookie and
// redirect; when the app loads, it asks GET /api/tasks/pending-open for the noted task and opens it.
//
// - /api/open/s/<code> — for a business that works through Monday (has an embed token): its
//   people have no login of their own, and the app can't be deep-linked inside Monday's iframe.
//   The code (CODE_LENGTH letters/digits, kept in task_links, good for LINK_DAYS) is for one
//   recipient and one task: it logs that person in here (outside Monday) for no longer than that.
// - /api/open/<task id> — everyone else: redirects to where the business works (messageLink.js),
//   and opening the task there still needs a normal login.
//
// The approved Meta templates put a comma right after the link and WhatsApp makes it part of the
// link, so both routes read only the code / task id at the start and ignore whatever trails it.

const LINK_DAYS = 2;
const CODE_LENGTH = 10;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const CLIENT_URL = () => process.env.CLIENT_URL || 'http://localhost:5173';
const COOKIE = 'open_task';
const MAX_AGE_SECONDS = 10 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CODE_PREFIX = new RegExp(`^[A-Za-z0-9]{${CODE_LENGTH}}`);
// Read inside Monday's iframe too, so cross-site like the session cookie (app.js).
const COOKIE_ATTRS =
  process.env.NODE_ENV === 'production' ? 'Path=/; HttpOnly; Secure; SameSite=None' : 'Path=/; HttpOnly; SameSite=Lax';

const noteTask = (res, taskId) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${taskId}; Max-Age=${MAX_AGE_SECONDS}; ${COOKIE_ATTRS}`);

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_links (
      code TEXT PRIMARY KEY,
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  tableReady = true;
}

function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// The link for one message: a short code for a business that works through Monday, plain otherwise.
export async function taskLinkFor({ tenantId, taskId, userId }) {
  if (!(await getEmbedToken(tenantId))) return `${CLIENT_URL()}/api/open/${taskId}`;
  // Auto-login only for the business's own regular people: never for a super admin (a forwarded
  // message would hand out the platform) or someone from another business — they log in as usual.
  const { rows } = await pool.query('SELECT tenant_id, is_super_admin FROM users WHERE id = $1', [userId]);
  if (!rows[0] || rows[0].is_super_admin || rows[0].tenant_id !== tenantId) {
    return `${CLIENT_URL()}/api/open/${taskId}?direct=1`;
  }
  await ensureTable();
  // Old links are useless after expiry; clearing them here keeps the table small.
  await pool.query("DELETE FROM task_links WHERE expires_at < now() - interval '1 day'");
  for (;;) {
    const code = newCode();
    const { rowCount } = await pool.query(
      `INSERT INTO task_links (code, task_id, tenant_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '${LINK_DAYS} days') ON CONFLICT (code) DO NOTHING`,
      [code, taskId, tenantId, userId]
    );
    if (rowCount) return `${CLIENT_URL()}/api/open/s/${code}`;
  }
}

router.get('/s/:code', async (req, res, next) => {
  const expired = () => res.redirect(302, `${CLIENT_URL()}/?loginError=link-expired`);
  try {
    const code = req.params.code.match(CODE_PREFIX)?.[0];
    if (!code) return expired();
    await ensureTable();
    const { rows: links } = await pool.query(
      'SELECT task_id, tenant_id, user_id, expires_at FROM task_links WHERE code = $1 AND expires_at > now()',
      [code]
    );
    const link = links[0];
    if (!link) return expired();
    noteTask(res, link.task_id);

    // Already inside that business (their own session, or a super admin looking at it): just open.
    const activeTenant =
      req.user?.is_super_admin && req.session.activeTenantId ? req.session.activeTenantId : req.user?.tenant_id;
    if (req.user && activeTenant === link.tenant_id) return res.redirect(302, `${CLIENT_URL()}/`);

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND is_super_admin IS NOT TRUE',
      [link.user_id, link.tenant_id]
    );
    if (!rows[0]) return expired();
    req.logIn(rows[0], (err) => {
      if (err) return next(err);
      // The login lasts no longer than the link itself.
      req.session.cookie.maxAge = Math.max(new Date(link.expires_at).getTime() - Date.now(), 60 * 1000);
      res.redirect(302, `${CLIENT_URL()}/`);
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:taskId', async (req, res) => {
  const taskId = req.params.taskId.match(UUID_PREFIX)?.[0];
  const { rows } = taskId ? await pool.query('SELECT tenant_id FROM tasks WHERE id = $1', [taskId]) : { rows: [] };
  if (!rows[0]) return res.redirect(302, `${CLIENT_URL()}/`);
  noteTask(res, taskId);
  // direct=1: this app (with its own login) rather than where the business works (taskLinkFor).
  res.redirect(302, req.query.direct ? `${CLIENT_URL()}/` : await messageLink(rows[0].tenant_id));
});

// The noted task id (or null), clearing the note so it opens only once.
export function takePendingTask(req, res) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)open_task=([^;]+)/);
  const taskId = match && UUID.test(match[1]) ? match[1] : null;
  if (taskId) res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`);
  return taskId;
}

export default router;
