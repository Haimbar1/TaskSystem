-- Each business's own task statuses (see src/services/taskStatuses.js, which also applies this at
-- runtime — keep the two in sync). tasks.status becomes free text instead of the fixed enum.
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
END $$;
