import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// One shared connection pool for the whole server, scoped per-request to a
// tenant via req.tenantId (see middleware/tenant.js) — every query that
// touches tenant data must filter by it explicitly.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});
