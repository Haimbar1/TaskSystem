-- Log of every outgoing WhatsApp message and what became of it (see src/services/whatsappLog.js,
-- which also creates this at runtime — keep the two in sync). status: skipped / failed / accepted (by Meta) and then, from
-- Meta's status webhook: sent / delivered / read / failed.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name TEXT,
  to_number TEXT,
  event_type TEXT,
  template_name TEXT,
  text TEXT,
  wamid TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_tenant_created ON whatsapp_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_wamid ON whatsapp_messages (wamid) WHERE wamid IS NOT NULL;
