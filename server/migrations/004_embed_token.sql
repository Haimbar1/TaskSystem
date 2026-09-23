-- Per-business token for embedding the app in another system (e.g. Monday) without a personal
-- login; see src/embed.js. Also ensured at runtime there, like portal_tenant_id.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS embed_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_embed_token_key ON tenants (embed_token) WHERE embed_token IS NOT NULL;
