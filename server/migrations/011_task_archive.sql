-- The task archive (see src/services/taskArchive.js, which also applies this at runtime — keep the
-- two in sync): completed tasks leave the everyday lists a week after completion, or by hand.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unarchived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_tenant_archived ON tasks (tenant_id, archived_at);
