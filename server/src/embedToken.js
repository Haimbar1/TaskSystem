// Creates (or replaces) the embed token of one business and prints the URL to embed.
// Usage: npm run embed-token -- "<business name>"
// Running it again for the same business replaces the token, so the old URL stops working.
import { pool } from './db.js';
import { rotateEmbedToken } from './embed.js';

async function run() {
  const name = process.argv[2]?.trim();
  if (!name) throw new Error('Usage: npm run embed-token -- "<business name>"');

  const { rows } = await pool.query('SELECT id, name FROM tenants WHERE btrim(name) = $1', [name]);
  if (rows.length === 0) throw new Error(`No business named "${name}"`);
  if (rows.length > 1) throw new Error(`More than one business named "${name}"`);

  const token = await rotateEmbedToken(rows[0].id);
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  console.log(`${rows[0].name}: ${clientUrl}/?embed_token=${token}`);
  await pool.end();
}

run().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
