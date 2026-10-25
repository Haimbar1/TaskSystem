import { Router } from 'express';
import { pool } from '../db.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { ensureStatusSchema, DEFAULT_STATUSES } from '../services/taskStatuses.js';

const router = Router();

// The daily overdue check. Run by the Vercel cron in vercel.json — every day at 06:00 UTC (08:00
// Israel in winter, 09:00 in summer; Vercel may fire it any time within that hour). Vercel calls it
// with GET and "Authorization: Bearer <CRON_SECRET>"; an n8n workflow can still POST with
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

  // Overdue = the due date is before today (UTC — at 06:00 UTC that's the Israeli date too), so a
  // task due yesterday gets its first reminder this morning, and one every morning after until it
  // reaches an ending status of the business (see taskStatuses.js) or is paused.
  await ensureStatusSchema();
  const { rows: overdueTasks } = await pool.query(
    `SELECT t.* FROM tasks t JOIN tenants tn ON tn.id = t.tenant_id
     WHERE t.due_date < CURRENT_DATE AND t.status <> 'paused'
       AND t.status NOT IN (
         SELECT s->>'key' FROM jsonb_array_elements(COALESCE(tn.task_statuses, $1::jsonb)) s
         WHERE (s->>'is_final')::boolean
       )`,
    [JSON.stringify(DEFAULT_STATUSES)]
  );

  const whatsappMessages = [];
  for (const task of overdueTasks) {
    // To the task's assignees (only those with a phone get the WhatsApp — see whatsapp.js) — not
    // to whoever opened it. Once a day each: a second run the same day (cron + n8n, a retry) skips.
    const { rows: assignees } = await pool.query(
      `SELECT a.user_id FROM task_assignees a
       WHERE a.task_id = $1 AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.task_id = a.task_id AND n.user_id = a.user_id AND n.type = 'overdue_reminder'
           AND n.created_at >= CURRENT_DATE
       )`,
      [task.id]
    );
    for (const { user_id } of assignees) {
      await pool.query(
        `INSERT INTO notifications (tenant_id, user_id, task_id, type, channel, payload)
         VALUES ($1, $2, $3, 'overdue_reminder', 'in_app', $4)`,
        [task.tenant_id, user_id, task.id, JSON.stringify({ due_date: task.due_date })]
      );
      const message = await sendWhatsAppMessage({
        tenantId: task.tenant_id,
        userId: user_id,
        eventType: 'overdue_reminder',
        task,
      });
      if (message) whatsappMessages.push(message);
    }
  }

  res.json({ checked: overdueTasks.length, whatsappMessages });
}

router.get('/check-overdue', checkOverdue);
router.post('/check-overdue', checkOverdue);

export default router;
