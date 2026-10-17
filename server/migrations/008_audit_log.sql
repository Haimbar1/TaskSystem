-- The business's action log, who did what (see src/services/auditLog.js, which also creates this at
-- runtime — keep the two in sync).
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  via_monday BOOLEAN NOT NULL DEFAULT false,
  action TEXT NOT NULL,
  task_id UUID,
  task_title TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_created ON audit_log (tenant_id, created_at DESC);
