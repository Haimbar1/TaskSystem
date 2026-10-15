import { Router } from 'express';
import { pool } from '../db.js';
import { messageLink } from '../services/messageLink.js';

const router = Router();

// The "קישור למשימה" in WhatsApp messages: /api/open/<task id>. The app can't be deep-linked inside
// Monday — it runs there in an iframe that can't see Monday's URL — so this notes the task in a
// short-lived cookie and redirects to where the business works (its Monday board, or this app; see
// messageLink.js). When the app loads there, it asks GET /api/tasks/pending-open for the noted task
// and opens it. Needs no login itself; opening the task still needs access to its business.

const COOKIE = 'open_task';
const MAX_AGE_SECONDS = 10 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Read inside Monday's iframe too, so cross-site like the session cookie (app.js).
const COOKIE_ATTRS =
  process.env.NODE_ENV === 'production' ? 'Path=/; HttpOnly; Secure; SameSite=None' : 'Path=/; HttpOnly; SameSite=Lax';

router.get('/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { rows } = UUID.test(taskId)
    ? await pool.query('SELECT tenant_id FROM tasks WHERE id = $1', [taskId])
    : { rows: [] };
  if (!rows[0]) return res.redirect(302, `${process.env.CLIENT_URL || 'http://localhost:5173'}/`);
  res.setHeader('Set-Cookie', `${COOKIE}=${taskId}; Max-Age=${MAX_AGE_SECONDS}; ${COOKIE_ATTRS}`);
  res.redirect(302, await messageLink(rows[0].tenant_id));
});

// The noted task id (or null), clearing the note so it opens only once.
export function takePendingTask(req, res) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)open_task=([^;]+)/);
  const taskId = match && UUID.test(match[1]) ? match[1] : null;
  if (taskId) res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`);
  return taskId;
}

export default router;
