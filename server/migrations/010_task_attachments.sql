-- Files attached to a task (images, PDFs, anything), kept in the database itself — the server runs
-- as Vercel serverless functions with no disk (see src/services/taskAttachments.js, which also
-- creates this at runtime — keep the two in sync).
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  via_monday BOOLEAN NOT NULL DEFAULT false,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_attachments_task_created ON task_attachments (task_id, created_at);
