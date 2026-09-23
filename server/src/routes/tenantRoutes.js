import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTenant } from '../middleware/tenant.js';
import { getEmbedToken, rotateEmbedToken, clearEmbedToken } from '../embed.js';

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

// Lists every business — used to populate the tenant switcher and the
// "which business does this new user belong to" picker.
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM tenants ORDER BY name');
  res.json(rows);
});

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

// Tenant admin's own business's WhatsApp Business credentials — lets each
// business send from its own number instead of sharing the WHATSAPP_* env
// vars (see services/whatsapp.js, which falls back to those env vars when
// these are unset). Access token is never sent back to the client in full.
router.get('/whatsapp-settings', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id FROM tenants WHERE id = $1',
    [req.tenantId]
  );
  const t = rows[0] || {};
  res.json({
    whatsapp_access_token_set: !!t.whatsapp_access_token,
    whatsapp_phone_number_id: t.whatsapp_phone_number_id || '',
    whatsapp_waba_id: t.whatsapp_waba_id || '',
  });
});

router.patch('/whatsapp-settings', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  const { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE tenants SET
       whatsapp_access_token = COALESCE(NULLIF($1, ''), whatsapp_access_token),
       whatsapp_phone_number_id = $2,
       whatsapp_waba_id = $3
     WHERE id = $4
     RETURNING whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id`,
    [whatsapp_access_token, whatsapp_phone_number_id || '', whatsapp_waba_id || '', req.tenantId]
  );
  const t = rows[0];
  res.json({
    whatsapp_access_token_set: !!t.whatsapp_access_token,
    whatsapp_phone_number_id: t.whatsapp_phone_number_id || '',
    whatsapp_waba_id: t.whatsapp_waba_id || '',
  });
});

// Tenant admin's embed token for their own business (embedding the app in e.g. Monday; see
// embed.js). POST creates a new one, replacing the old; DELETE turns embedding off.
router.get('/embed-token', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  res.json({ token: await getEmbedToken(req.tenantId) });
});

router.post('/embed-token', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  res.json({ token: await rotateEmbedToken(req.tenantId) });
});

router.delete('/embed-token', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  await clearEmbedToken(req.tenantId);
  res.json({ token: null });
});

export default router;
