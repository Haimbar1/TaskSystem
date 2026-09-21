-- Links a business here to its business in the portal (portal.smartesek.com), which is where
-- businesses and members are managed. Filled in automatically on the first SSO login.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS portal_tenant_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_portal_tenant_id_key ON tenants (portal_tenant_id) WHERE portal_tenant_id IS NOT NULL;
