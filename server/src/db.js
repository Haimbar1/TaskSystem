import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// DATE columns (due_date) come back as the plain "2026-09-14" they hold. As a JS Date they became
// local midnight, which the client read in UTC — a day early ("Sept/13"), and the edit form then
// saved that earlier day back.
pg.types.setTypeParser(1082, (value) => value);

// One shared connection pool for the whole server, scoped per-request to a
// tenant via req.tenantId (see middleware/tenant.js) — every query that
// touches tenant data must filter by it explicitly.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});
