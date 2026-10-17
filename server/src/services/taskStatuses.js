import crypto from 'crypto';
import { pool } from '../db.js';
import { STATUS_LABELS } from '../labels.js';

// Each business sets its own task statuses (the "סטטוסים של משימות" screen under the gear): their
// order (= the Kanban columns), name, color and whether the status ends the task ("סיום" — e.g. both
// בוצע and נדחה). A task gets its completion date (completed_at) when it moves into an ending status
// and loses it as soon as it's in one that isn't. Stored as a list on the tenants row; null = the
// defaults below. Keys stay fixed once created, so renaming a status never touches its tasks.

export const DEFAULT_STATUSES = [
  { key: 'new', label: STATUS_LABELS.new, color: 'sky', is_final: false },
  { key: 'transferred', label: STATUS_LABELS.transferred, color: 'amber', is_final: false },
  { key: 'in_progress', label: STATUS_LABELS.in_progress, color: 'teal', is_final: false },
  { key: 'done', label: STATUS_LABELS.done, color: 'emerald', is_final: true },
  { key: 'paused', label: STATUS_LABELS.paused, color: 'gray', is_final: false },
];

// Must match STATUS_COLOR_OPTIONS in client/src/constants.js.
export const STATUS_COLORS = ['sky', 'amber', 'teal', 'emerald', 'gray', 'red', 'violet', 'pink', 'orange', 'blue'];

// Same as migrations/007_task_statuses.sql (keep in sync), so a serverless deploy gets it on first use.
// tasks.status was a fixed enum; a business's own statuses need free text.
const SCHEMA = `
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS task_statuses JSONB;
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'status') = 'USER-DEFINED' THEN
    ALTER TABLE tasks ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE tasks ALTER COLUMN status TYPE TEXT USING status::text;
    ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'new';
    -- A task that was once בוצע and moved on kept its completion date; it isn't completed.
    UPDATE tasks SET completed_at = NULL WHERE status <> 'done' AND completed_at IS NOT NULL;
  END IF;
END $$;`;

let schemaReady = false;
export async function ensureStatusSchema() {
  if (schemaReady) return;
  await pool.query(SCHEMA);
  schemaReady = true;
}

export async function getStatuses(tenantId) {
  await ensureStatusSchema();
  const { rows } = await pool.query('SELECT task_statuses FROM tenants WHERE id = $1', [tenantId]);
  const list = rows[0]?.task_statuses;
  return Array.isArray(list) && list.length ? list : DEFAULT_STATUSES;
}

export const finalKeys = (statuses) => statuses.filter((s) => s.is_final).map((s) => s.key);

export function statusLabel(statuses, key) {
  return statuses.find((s) => s.key === key)?.label || STATUS_LABELS[key] || key;
}

// Replaces the business's list. Returns { error } (Hebrew, for the screen) or { statuses }.
// A status still holding tasks can't be removed — they'd have no column.
export async function setStatuses(tenantId, input) {
  if (!Array.isArray(input) || input.length === 0) return { error: 'צריך לפחות סטטוס אחד' };
  const current = await getStatuses(tenantId);
  const currentKeys = new Set(current.map((s) => s.key));

  const statuses = [];
  const labels = new Set();
  for (const s of input) {
    const label = String(s?.label ?? '').trim();
    if (!label) return { error: 'לכל סטטוס צריך שם' };
    if (label.length > 40) return { error: `השם "${label}" ארוך מדי` };
    if (labels.has(label)) return { error: `הסטטוס "${label}" מופיע פעמיים` };
    labels.add(label);
    const key = currentKeys.has(s.key) ? s.key : `s_${crypto.randomBytes(4).toString('hex')}`;
    statuses.push({
      key,
      label,
      color: STATUS_COLORS.includes(s.color) ? s.color : 'gray',
      is_final: !!s.is_final,
    });
  }
  if (!statuses.some((s) => s.is_final)) return { error: 'צריך לפחות סטטוס סיום אחד' };
  // New tasks start in the first status.
  if (statuses[0].is_final) return { error: 'הסטטוס הראשון (שבו נפתחות משימות חדשות) לא יכול להיות סטטוס סיום' };

  const keys = statuses.map((s) => s.key);
  const { rows: inUse } = await pool.query(
    `SELECT status, count(*)::int AS n FROM tasks
     WHERE tenant_id = $1 AND NOT (status = ANY($2::text[])) GROUP BY status`,
    [tenantId, keys]
  );
  if (inUse.length) {
    const names = inUse.map((r) => `"${statusLabel(current, r.status)}" (${r.n})`).join(', ');
    return { error: `אי אפשר למחוק סטטוס שיש בו משימות: ${names}. יש להעביר אותן קודם לסטטוס אחר.` };
  }

  const finals = finalKeys(statuses);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE tenants SET task_statuses = $1 WHERE id = $2', [JSON.stringify(statuses), tenantId]);
    // A status that became / stopped being an ending one: its tasks follow.
    await client.query(
      `UPDATE tasks SET completed_at = NULL
       WHERE tenant_id = $1 AND completed_at IS NOT NULL AND NOT (status = ANY($2::text[]))`,
      [tenantId, finals]
    );
    await client.query(
      `UPDATE tasks SET completed_at = updated_at
       WHERE tenant_id = $1 AND completed_at IS NULL AND status = ANY($2::text[])`,
      [tenantId, finals]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { statuses };
}
