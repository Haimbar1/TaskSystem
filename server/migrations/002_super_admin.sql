-- Platform-level flag, independent of the per-tenant admin/member role: lets
-- a person switch which business (tenant) they're acting as (see
-- middleware/tenant.js and routes/authRoutes.js's switch-tenant endpoint).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
