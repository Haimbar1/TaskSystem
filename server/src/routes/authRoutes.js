import { Router } from 'express';
import passport from 'passport';
import { pool } from '../db.js';

const router = Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  }
);

router.post('/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });

  const activeTenantId =
    req.user.is_super_admin && req.session.activeTenantId
      ? req.session.activeTenantId
      : req.user.tenant_id;
  const { rows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [activeTenantId]);

  res.json({
    user: { ...req.user, activeTenantId, activeTenantName: rows[0]?.name || null },
  });
});

// Super-admin only: change which business's data every /api/tasks and
// /api/users request should be scoped to (see middleware/tenant.js).
router.post('/switch-tenant', async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.user.is_super_admin) return res.status(403).json({ error: 'Super admins only' });

  const { tenantId } = req.body;
  const { rows } = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
  if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });

  req.session.activeTenantId = tenantId;
  res.json({ ok: true, tenantId });
});

export default router;
