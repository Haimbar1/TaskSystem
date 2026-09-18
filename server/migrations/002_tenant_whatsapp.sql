-- Per-tenant WhatsApp Business credentials, so each business can send from
-- its own number instead of sharing the WHATSAPP_* env vars. Columns are
-- nullable: whatsapp.js falls back to the env vars for a tenant that hasn't
-- configured its own yet.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_waba_id TEXT;
