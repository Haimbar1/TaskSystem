import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../db.js';
import { messageLink } from '../services/messageLink.js';
import { getEmbedToken } from '../embed.js';

const router = Router();

// The "קישור למשימה" in WhatsApp messages. Both kinds note the task in a short-lived cookie and
// redirect; when the app loads, it asks GET /api/tasks/pending-open for the noted task and opens it.
//
// - /api/open/s/<token> — for a business that works through Monday (has an embed token): its
//   people have no login of their own, and the app can't be deep-linked inside Monday's iframe.
//   The token, signed and good for LINK_DAYS, is for one recipient and one task: it logs that
//   person in here (outside Monday) for no longer than the token's remaining time.
// - /api/open/<task id> — everyone else: redirects to where the business works (messageLink.js),
//   and opening the task there still needs a normal login.

const LINK_DAYS = 2;
const CLIENT_URL = () => process.env.CLIENT_URL || 'http://localhost:5173';
const SECRET = () => process.env.SESSION_SECRET || 'change-me';
const COOKIE = 'open_task';
const MAX_AGE_SECONDS = 10 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Read inside Monday's iframe too, so cross-site like the session cookie (app.js).
const COOKIE_ATTRS =
  process.env.NODE_ENV === 'production' ? 'Path=/; HttpOnly; Secure; SameSite=None' : 'Path=/; HttpOnly; SameSite=Lax';

const noteTask = (res, taskId) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${taskId}; Max-Age=${MAX_AGE_SECONDS}; ${COOKIE_ATTRS}`);

// The link for one message: signed for a business that works through Monday, plain otherwise.
export async function taskLinkFor({ tenantId, taskId, userId }) {
  if (!(await getEmbedToken(tenantId))) return `${CLIENT_URL()}/api/open/${taskId}`;
  // Auto-login only for the business's own regular people: never for a super admin (a forwarded
  // message would hand out the platform) or someone from another business — they log in as usual.
  const { rows } = await pool.query('SELECT tenant_id, is_super_admin FROM users WHERE id = $1', [userId]);
  if (!rows[0] || rows[0].is_super_admin || rows[0].tenant_id !== tenantId) {
    return `${CLIENT_URL()}/api/open/${taskId}?direct=1`;
  }
  const token = jwt.sign({ typ: 'task-link', taskId, tenantId, userId }, SECRET(), { expiresIn: `${LINK_DAYS}d` });
  return `${CLIENT_URL()}/api/open/s/${token}`;
}

router.get('/s/:token', async (req, res, next) => {
  let claims;
  try {
    claims = jwt.verify(req.params.token, SECRET());
  } catch {
    claims = null;
  }
  if (claims?.typ !== 'task-link') return res.redirect(302, `${CLIENT_URL()}/?loginError=link-expired`);
  const { taskId, tenantId, userId, exp } = claims;
  noteTask(res, taskId);

  // Already inside that business (their own session, or a super admin looking at it): just open.
  const activeTenant =
    req.user?.is_super_admin && req.session.activeTenantId ? req.session.activeTenantId : req.user?.tenant_id;
  if (req.user && activeTenant === tenantId) return res.redirect(302, `${CLIENT_URL()}/`);

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND is_super_admin IS NOT TRUE',
      [userId, tenantId]
    );
    if (!rows[0]) return res.redirect(302, `${CLIENT_URL()}/?loginError=link-expired`);
    req.logIn(rows[0], (err) => {
      if (err) return next(err);
      // The login lasts no longer than the link itself.
      req.session.cookie.maxAge = Math.max(exp * 1000 - Date.now(), 60 * 1000);
      res.redirect(302, `${CLIENT_URL()}/`);
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { rows } = UUID.test(taskId)
    ? await pool.query('SELECT tenant_id FROM tasks WHERE id = $1', [taskId])
    : { rows: [] };
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
