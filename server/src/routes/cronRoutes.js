import { Router } from 'express';
import { pool } from '../db.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { ensureStatusSchema, DEFAULT_STATUSES } from '../services/taskStatuses.js';

const router = Router();

// Called once a day by an n8n workflow (per the spec doc) instead of a
// platform cron job. Protected by a shared secret, not a user session.
router.post('/check-overdue', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Not for completed tasks (any ending status of the business, see taskStatuses.js) or paused ones.
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
    const { rows: assignees } = await pool.query(
      'SELECT user_id FROM task_assignees WHERE task_id = $1',
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
});

export default router;
