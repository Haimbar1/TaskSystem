import crypto from 'crypto';
import { pool } from './db.js';

// Embedding the app inside another system (e.g. a Monday board view) for a specific business:
// the embedded URL carries a per-business token instead of a personal login. Everyone who comes
// in that way shares one "service" user of that business, so anything that needs the real person
// (who created a task — they get notified on its changes) asks for it explicitly; see the
// created_by handling in routes/taskRoutes.js.
//
// The service user is recognised by its reserved email, so no users column is needed and it can
// be kept out of the users list (it's not someone you can assign a task to).
export const EMBED_USER_EMAIL = 'embed@service.local';
export const EMBED_USER_NAME = 'Monday';

export const isEmbedUser = (user) => user?.email === EMBED_USER_EMAIL;

let columnReady = false;
async function ensureColumn() {
  if (columnReady) return;
  await pool.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS embed_token TEXT');
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS tenants_embed_token_key ON tenants (embed_token) WHERE embed_token IS NOT NULL'
  );
  columnReady = true;
}

// People of an embedded business are added by a super admin and never log in, so email is
// optional for them (see routes/userRoutes.js). Queries that exclude the service user by email
// must therefore use IS DISTINCT FROM, not <>, or they'd drop these users too.
let nullableEmailReady = false;
export async function ensureOptionalUserEmail() {
  if (nullableEmailReady) return;
  await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
  nullableEmailReady = true;
}

// Returns the business's service user for a valid token, creating it on first use; null otherwise.
export async function userForEmbedToken(token) {
  if (!token) return null;
  await ensureColumn();
  const { rows: tenantRows } = await pool.query('SELECT id FROM tenants WHERE embed_token = $1', [token]);
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) return null;

  const { rows } = await pool.query(
    `INSERT INTO users (tenant_id, email, name, role) VALUES ($1, $2, $3, 'member')
     ON CONFLICT (tenant_id, email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [tenantId, EMBED_USER_EMAIL, EMBED_USER_NAME]
  );
  return rows[0];
}

export async function getEmbedToken(tenantId) {
  await ensureColumn();
  const { rows } = await pool.query('SELECT embed_token FROM tenants WHERE id = $1', [tenantId]);
  return rows[0]?.embed_token || null;
}

// Turns embedding off for the business: its URL stops working.
export async function clearEmbedToken(tenantId) {
  await ensureColumn();
  await pool.query('UPDATE tenants SET embed_token = NULL WHERE id = $1', [tenantId]);
}

// Sets a new token for the business (the old one stops working immediately).
export async function rotateEmbedToken(tenantId) {
  await ensureColumn();
  const token = crypto.randomBytes(24).toString('base64url');
  const { rows } = await pool.query('UPDATE tenants SET embed_token = $1 WHERE id = $2 RETURNING id', [token, tenantId]);
  return rows[0] ? token : null;
}
