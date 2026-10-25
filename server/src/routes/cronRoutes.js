import { Router } from 'express';
import { runScheduledChecks } from '../services/overdueCheck.js';

const router = Router();

// The overdue check (services/overdueCheck.js). Run every hour by the Vercel cron in vercel.json;
// each business is checked once a day, on the first run at or after the hour it picked. Vercel
// calls with GET and "Authorization: Bearer <CRON_SECRET>"; an n8n workflow can still POST with
// x-cron-secret. Protected by that shared secret, not a user session.
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers['x-cron-secret'] === secret || req.headers.authorization === `Bearer ${secret}`;
}

async function checkOverdue(req, res) {
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ businesses: await runScheduledChecks() });
}

router.get('/check-overdue', checkOverdue);
router.post('/check-overdue', checkOverdue);

export default router;
