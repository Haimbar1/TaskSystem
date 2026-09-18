import { Router } from 'express';
import { pool } from '../db.js';
import { buildWhatsAppMessage } from '../services/whatsapp.js';

const router = Router();

// Called once a day by an n8n workflow (per the spec doc) instead of a
// platform cron job. Protected by a shared secret, not a user session.
router.post('/check-overdue', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { rows: overdueTasks } = await pool.query(
    `SELECT * FROM tasks
     WHERE due_date < CURRENT_DATE AND status NOT IN ('done', 'paused')`
  );

  const whatsappPreviews = [];
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
      const message = await buildWhatsAppMessage({
        tenantId: task.tenant_id,
        userId: user_id,
        eventType: 'overdue_reminder',
        task,
      });
      if (message) {
        // No user session to show a preview popup to here (n8n calls this,
        // not a browser) — log it so it's still visible while unverified.
        console.log('WhatsApp preview (overdue):', message);
        whatsappPreviews.push(message);
      }
    }
  }

  res.json({ checked: overdueTasks.length, whatsappPreviews });
});

export default router;
