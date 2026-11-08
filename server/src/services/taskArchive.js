import { pool } from '../db.js';

// The archive ("ארכיון"): a completed task leaves the everyday lists (table and both Kanbans) a
// week after it was completed, or earlier with "העבר לארכיון" in its window. Archived tasks still
// show when "כולל ארכיון" is ticked in the search bar (client components/TaskFilters.jsx), and
// moving one back to an open status takes it out of the archive. "החזר מהארכיון" keeps a task
// out until it is completed again (unarchived_at), so the weekly rule doesn't take it straight back.
export const ARCHIVE_AFTER = "interval '7 days'";

// Same as migrations/011_task_archive.sql (keep in sync), so a serverless deploy gets it on first use.
const SCHEMA = `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unarchived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_tenant_archived ON tasks (tenant_id, archived_at);`;

let schemaReady = false;
export async function ensureArchiveSchema() {
  if (schemaReady) return;
  await pool.query(SCHEMA);
  schemaReady = true;
}

// Archives the business's tasks completed more than a week ago (run before each task list, so it
// needs no scheduled job). completed_at is only set while a task is in an ending status.
export async function autoArchive(tenantId) {
  await ensureArchiveSchema();
  await pool.query(
    `UPDATE tasks SET archived_at = completed_at + ${ARCHIVE_AFTER}
     WHERE tenant_id = $1 AND archived_at IS NULL AND completed_at IS NOT NULL
       AND completed_at < now() - ${ARCHIVE_AFTER}
       AND (unarchived_at IS NULL OR unarchived_at < completed_at)`,
    [tenantId]
  );
}
