import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTenant } from '../middleware/tenant.js';
import { getEmbedToken, rotateEmbedToken, clearEmbedToken } from '../embed.js';
import { whatsappCredentials, writeToVault } from '../tenantSecrets.js';
import { listMessages, statusForwardUrl } from '../services/whatsappLog.js';

const router = Router();

function requireSuperAdmin(req, res, next) {
  if (!req.user.is_super_admin) return res.status(403).json({ error: 'Super admins only' });
  next();
}

function requireTenantAdmin(req, res, next) {
  if (req.user.role !== 'admin' && !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

// Creates a brand-new business plus its first admin user, who can then sign
// in with Google (googleStrategy.js matches them by email once this row
// exists). Super-admin only — regular tenant admins manage their own
// business's users via /api/users/invite instead.
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  const { businessName, name, email, phone } = req.body;
  if (!businessName || !email || !phone) {
    return res.status(400).json({ error: 'businessName, email and phone are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tenantRows } = await client.query(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING *',
      [businessName]
    );
    const tenant = tenantRows[0];
    const { rows: userRows } = await client.query(
      `INSERT INTO users (tenant_id, email, name, phone, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id, name, email, phone, role`,
      [tenant.id, email, name, phone]
    );
    await client.query('COMMIT');
    res.status(201).json({ tenant, user: userRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    console.error('POST /api/tenants failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Tenant admin's own business's WhatsApp Business credentials. They live in the portal vault,
// shared with the WhatsApp system and BotApp (see tenantSecrets.js): this shows the effective
// values and writes what's saved here into the vault too (and onto the tenants row, for a
// business not linked to the portal). Access token is never sent back to the client in full.
async function whatsappSettingsResponse(tenantId, extra = {}) {
  const { values, sources, linked } = await whatsappCredentials(tenantId);
  return {
    whatsapp_access_token_set: !!values.whatsapp_access_token,
    whatsapp_phone_number_id: values.whatsapp_phone_number_id || '',
    whatsapp_waba_id: values.whatsapp_waba_id || '',
    sources,
    linked,
    ...extra,
  };
}

router.get('/whatsapp-settings', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  res.json(await whatsappSettingsResponse(req.tenantId, { status_forward_url: statusForwardUrl(req) }));
});

// Business admins can see the settings (GET above); only the platform owner changes them.
router.patch('/whatsapp-settings', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id } = req.body;
  await pool.query(
    `UPDATE tenants SET
       whatsapp_access_token = COALESCE(NULLIF($1, ''), whatsapp_access_token),
       whatsapp_phone_number_id = $2,
       whatsapp_waba_id = $3
     WHERE id = $4`,
    [whatsapp_access_token, whatsapp_phone_number_id || '', whatsapp_waba_id || '', req.tenantId]
  );
  const vault = await writeToVault(
    req.tenantId,
    { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id },
    req.user?.email
  );
  if (!vault.ok && vault.error !== 'not-linked') console.warn('[secrets] writing to the portal vault failed:', vault.error);
  res.json(await whatsappSettingsResponse(req.tenantId, { vault }));
});

// The active business's outgoing WhatsApp log, newest first (see services/whatsappLog.js).
router.get('/whatsapp-log', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  res.json(await listMessages(req.tenantId));
});

// The active business's embed token (embedding the app in e.g. Monday; see embed.js). Super admin
// only: it's set up by the platform owner, not by the business's own admins.
// POST creates a new one, replacing the old; DELETE turns embedding off.
router.get('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  res.json({ token: await getEmbedToken(req.tenantId) });
});

router.post('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  res.json({ token: await rotateEmbedToken(req.tenantId) });
});

router.delete('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  await clearEmbedToken(req.tenantId);
  res.json({ token: null });
});

export default router;
