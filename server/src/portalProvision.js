import { pool } from './db.js';

// The portal is the single place where businesses and their members are managed. Its SSO token
// carries the business (portal tenant id/name) and the person's role in it; this makes sure the
// matching tenant and user exist here, so nobody has to be created twice.
//
// Rules, in order:
//  1. A tenant already linked to that portal tenant id is used.
//  2. Otherwise an unlinked tenant with the same name (trimmed) is linked, so today's existing
//     businesses join the portal without duplicates.
//  3. Otherwise a new tenant is created and linked.
// Users: matched per (tenant, email); created if missing (role from the portal). An existing
// user's role is never changed here, only new users get the portal role.

let columnReady = false;
async function ensureColumn() {
  if (columnReady) return;
  await pool.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS portal_tenant_id INTEGER');
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS tenants_portal_tenant_id_key ON tenants (portal_tenant_id) WHERE portal_tenant_id IS NOT NULL'
  );
  columnReady = true;
}

const localRole = (portalRole) => (portalRole === 'owner' || portalRole === 'admin' ? 'admin' : 'member');

export async function provisionFromPortal(payload) {
  const portalTenant = payload?.tenant;
  if (!portalTenant?.id) return null; // older token without business info: caller uses the old path
  await ensureColumn();

  const portalId = Number(portalTenant.id);
  const name = String(portalTenant.name || portalTenant.slug || `Business ${portalId}`).trim();

  let { rows } = await pool.query('SELECT id FROM tenants WHERE portal_tenant_id = $1', [portalId]);
  if (!rows[0]) {
    ({ rows } = await pool.query(
      `UPDATE tenants SET portal_tenant_id = $1
        WHERE id = (SELECT id FROM tenants WHERE portal_tenant_id IS NULL AND btrim(name) = $2 LIMIT 1)
        RETURNING id`,
      [portalId, name]
    ));
  }
  if (!rows[0]) {
    ({ rows } = await pool.query('INSERT INTO tenants (name, portal_tenant_id) VALUES ($1, $2) RETURNING id', [name, portalId]));
  }
  const tenantId = rows[0].id;

  const email = String(payload.email || '').toLowerCase().trim();
  let user;
  ({ rows } = await pool.query('SELECT * FROM users WHERE tenant_id = $1 AND lower(email) = $2', [tenantId, email]));
  user = rows[0];

  if (!user && payload.isSuperAdmin) {
    // A platform super admin already has a row in some business; they switch between businesses
    // via the session (see middleware/tenant.js) instead of getting a copy in each one.
    ({ rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1 AND is_super_admin = true LIMIT 1', [email]));
    user = rows[0];
  }

  if (!user) {
    ({ rows } = await pool.query(
      'INSERT INTO users (tenant_id, email, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenantId, email, payload.name || email, localRole(payload.role)]
    ));
    user = rows[0];
  }
  return { user, tenantId };
}
