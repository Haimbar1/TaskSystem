import { pool } from '../db.js';

// Notes on how a task is going ("הערות ביצוע" in the task form): each one keeps who wrote it and
// when, added automatically. Inside Monday the writer is whoever was picked in "מי את/ה?"
// (services/auditLog.js). The name is kept as written, so a note still reads right after its
// writer is deleted.

// Same as migrations/009_task_notes.sql (keep in sync), so a serverless deploy creates it on first use.
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  via_monday BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_notes_task_created ON task_notes (task_id, created_at);`;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(CREATE_TABLE);
  tableReady = true;
}

export async function listNotes(taskId) {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, user_id, author_name, via_monday, body, created_at FROM task_notes
     WHERE task_id = $1 ORDER BY created_at`,
    [taskId]
  );
  return rows;
}

export async function addNote(taskId, actor, body) {
  await ensureTable();
  const { rows } = await pool.query(
    `INSERT INTO task_notes (task_id, user_id, author_name, via_monday, body) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, author_name, via_monday, body, created_at`,
    [taskId, actor.userId, actor.name, actor.viaMonday, body]
  );
  return rows[0];
}
