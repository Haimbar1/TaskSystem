import { pool } from '../db.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { ensureStatusSchema, DEFAULT_STATUSES } from './taskStatuses.js';

// The overdue check: a WhatsApp reminder to the assignees of every task whose due date has passed.
// Each business picks the hour (Israel time, default 08:00 — tenants.overdue_check_hour) on the
// WhatsApp settings screen. The cron (routes/cronRoutes.js) calls runScheduledChecks every hour;
// a business is checked on the first run at or after its hour, once a day (overdue_checked_on).
// "בדוק עכשיו" on the settings screen runs one business's check at once (runOverdueCheck).

export const DEFAULT_CHECK_HOUR = 8;
const TZ = 'Asia/Jerusalem';
// today in Israel, and the moment it started
const LOCAL_DATE = `(now() AT TIME ZONE '${TZ}')::date`;
const LOCAL_MIDNIGHT = `(date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;

let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await pool.query(
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS overdue_check_hour SMALLINT,
                         ADD COLUMN IF NOT EXISTS overdue_checked_on DATE`
  );
  columnsReady = true;
}

export async function getCheckSettings(tenantId) {
  await ensureColumns();
  const { rows } = await pool.query('SELECT overdue_check_hour, overdue_checked_on FROM tenants WHERE id = $1', [
    tenantId,
  ]);
  return {
    hour: rows[0]?.overdue_check_hour ?? DEFAULT_CHECK_HOUR,
    last_checked_on: rows[0]?.overdue_checked_on || null,
  };
}

// Returns an error message for an hour that isn't 0–23.
export async function setCheckHour(tenantId, hour) {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return 'שעה לא תקינה';
  await ensureColumns();
  await pool.query('UPDATE tenants SET overdue_check_hour = $1 WHERE id = $2', [h, tenantId]);
  return null;
}

// Checks one business now. Overdue = the due date is before today (Israel), so a task due
// yesterday gets its first reminder this morning, and one every day after until it reaches an
// ending status of the business (see taskStatuses.js) or is paused. Each assignee gets it at most
// once a day per task: a second run the same day skips them (counted in alreadySent).
export async function runOverdueCheck(tenantId) {
  await ensureColumns();
  await ensureStatusSchema();
  await pool.query(`UPDATE tenants SET overdue_checked_on = ${LOCAL_DATE} WHERE id = $1`, [tenantId]);
  const { rows: overdueTasks } = await pool.query(
    `SELECT t.* FROM tasks t JOIN tenants tn ON tn.id = t.tenant_id
     WHERE t.tenant_id = $2 AND t.due_date < ${LOCAL_DATE} AND t.status <> 'paused'
       AND t.status NOT IN (
         SELECT s->>'key' FROM jsonb_array_elements(COALESCE(tn.task_statuses, $1::jsonb)) s
         WHERE (s->>'is_final')::boolean
       )`,
    [JSON.stringify(DEFAULT_STATUSES), tenantId]
  );

  const whatsappMessages = [];
  let alreadySent = 0;
  for (const task of overdueTasks) {
    // To the task's assignees (only those with a phone get the WhatsApp — see whatsapp.js), not
    // to whoever opened it.
    const { rows: assignees } = await pool.query(
      `SELECT a.user_id, EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.task_id = a.task_id AND n.user_id = a.user_id AND n.type = 'overdue_reminder'
           AND n.created_at >= ${LOCAL_MIDNIGHT}
       ) AS sent_today
       FROM task_assignees a WHERE a.task_id = $1`,
      [task.id]
    );
    for (const { user_id, sent_today } of assignees) {
      if (sent_today) {
        alreadySent++;
        continue;
      }
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
      if (message) whatsappMessages.push({ ...message, taskTitle: task.title });
    }
  }
  return { checked: overdueTasks.length, alreadySent, whatsappMessages };
}

// The hourly cron: every business whose hour has come (Israel time) and that wasn't checked today.
// Claimed by marking it checked first, so overlapping runs don't both send.
export async function runScheduledChecks() {
  await ensureColumns();
  const { rows } = await pool.query(
    `UPDATE tenants SET overdue_checked_on = ${LOCAL_DATE}
     WHERE (overdue_checked_on IS NULL OR overdue_checked_on < ${LOCAL_DATE})
       AND EXTRACT(HOUR FROM now() AT TIME ZONE '${TZ}') >= COALESCE(overdue_check_hour, $1)
     RETURNING id`,
    [DEFAULT_CHECK_HOUR]
  );
  const results = [];
  for (const { id } of rows) {
    try {
      results.push({ tenantId: id, ...(await runOverdueCheck(id)) });
    } catch (err) {
      console.error('[overdue] check failed for tenant', id, err);
      results.push({ tenantId: id, error: err.message });
    }
  }
  return results;
}
