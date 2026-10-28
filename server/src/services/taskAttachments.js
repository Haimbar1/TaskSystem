import { pool } from '../db.js';

// Files attached to a task ("קבצים מצורפים" in the task form): images, PDFs, anything. Kept in
// Postgres itself, since the server runs as Vercel serverless functions with no disk. Vercel caps a
// request body at about 4.5MB, so one file is limited to MAX_BYTES.

export const MAX_BYTES = 4 * 1024 * 1024;

// Same as migrations/010_task_attachments.sql (keep in sync), so a serverless deploy creates it on first use.
const CREATE_TABLE = `
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
ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS thumb BYTEA;`;

// The images the table shows a thumbnail of (TableView "תמונה"); the same list as INLINE_TYPES' images
// in routes/taskRoutes.js.
export const IMAGE_TYPE_SQL = "'^image/(png|jpe?g|gif|webp|bmp|avif)$'";
export const MAX_THUMB_BYTES = 200 * 1024;

let tableReady = false;
// Exported for the task list, which asks each task for its first image.
export async function ensureTable() {
  if (tableReady) return;
  await pool.query(CREATE_TABLE);
  tableReady = true;
}

const COLUMNS = 'id, user_id, author_name, via_monday, file_name, mime_type, size_bytes, created_at';

// Without the file contents — those come one at a time from getAttachment.
export async function listAttachments(taskId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM task_attachments WHERE task_id = $1 ORDER BY created_at`,
    [taskId]
  );
  return rows;
}

export async function addAttachment(taskId, actor, { fileName, mimeType, data }) {
  await ensureTable();
  const { rows } = await pool.query(
    `INSERT INTO task_attachments (task_id, user_id, author_name, via_monday, file_name, mime_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
    [taskId, actor.userId, actor.name, actor.viaMonday, fileName, mimeType, data.length, data]
  );
  return rows[0];
}

export async function getAttachment(taskId, attachmentId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}, data FROM task_attachments WHERE id = $1 AND task_id = $2`,
    [attachmentId, taskId]
  ).catch(() => ({ rows: [] })); // not a uuid
  return rows[0] || null;
}

// A small copy of an image, made by the browser that uploaded it (no image library on the server).
export async function setThumb(taskId, attachmentId, thumb) {
  await ensureTable();
  const { rowCount } = await pool.query(
    'UPDATE task_attachments SET thumb = $3 WHERE id = $1 AND task_id = $2',
    [attachmentId, taskId, thumb]
  ).catch(() => ({ rowCount: 0 }));
  return rowCount > 0;
}

// The small copy, or the image itself when it has none (uploaded before thumbnails existed).
export async function getThumb(taskId, attachmentId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT mime_type, thumb, CASE WHEN thumb IS NULL THEN data END AS data
     FROM task_attachments WHERE id = $1 AND task_id = $2 AND mime_type ~* ${IMAGE_TYPE_SQL}`,
    [attachmentId, taskId]
  ).catch(() => ({ rows: [] }));
  const row = rows[0];
  if (!row) return null;
  return row.thumb ? { mimeType: 'image/jpeg', data: row.thumb } : { mimeType: row.mime_type, data: row.data };
}

export async function deleteAttachment(taskId, attachmentId) {
  await ensureTable();
  const { rows } = await pool.query(
    'DELETE FROM task_attachments WHERE id = $1 AND task_id = $2 RETURNING file_name',
    [attachmentId, taskId]
  ).catch(() => ({ rows: [] }));
  return rows[0] || null;
}
