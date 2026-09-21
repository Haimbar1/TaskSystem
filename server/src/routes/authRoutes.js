import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { provisionFromPortal } from '../portalProvision.js';

const router = Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    if (err) return next(err);
    // failureRedirect defaults to a path on THIS (API) host, which has no
    // /login route — the client is a separate SPA that always renders
    // Login when logged out, so bounce back to its root instead.
    if (!user) return res.redirect(clientUrl);
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.redirect(clientUrl);
    });
  })(req, res, next);
});

// Single Sign-On from the unified Portal (portal.smartesek.com): the portal already
// verified this user's Google identity and their access to this module, and hands off
// a short-lived signed token instead of making them go through the Google popup again
// here. Purely additive — mirrors the exact same req.logIn(...) + redirect the regular
// /google/callback route above already does, so the normal Google OAuth login is
// completely untouched and still works on its own if this route is ever removed.
router.get('/sso', async (req, res, next) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const sharedSecret = process.env.SSO_SHARED_SECRET;
  const { token } = req.query;

  if (!sharedSecret) return res.redirect(`${clientUrl}?ssoError=not-configured`);
  if (!token) return res.redirect(`${clientUrl}?ssoError=missing-token`);

  let payload;
  try {
    payload = jwt.verify(token, sharedSecret);
  } catch {
    return res.redirect(`${clientUrl}?ssoError=invalid-token`);
  }

  const email = String(payload.email || '').toLowerCase().trim();
  if (!email) return res.redirect(`${clientUrl}?ssoError=invalid-token`);

  try {
    // New portal tokens say which business the person is entering and their role in it; the
    // matching tenant/user is created or linked here (portal is where members are managed).
    // Older tokens without that info fall through to the invite-only lookup below.
    const provisioned = await provisionFromPortal({ ...payload, email });
    let user = provisioned?.user;
    if (!user) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      user = rows[0];
      // Same invite-only rule as the Google OAuth strategy: an admin must have
      // already added this email as a user row before they can sign in.
      if (!user) return res.redirect(`${clientUrl}?ssoError=not-invited`);
    }

    req.logIn(user, (err) => {
      if (err) return next(err);
      // A super admin lands in the business they chose in the portal.
      if (provisioned && user.is_super_admin) req.session.activeTenantId = provisioned.tenantId;
      res.redirect(clientUrl);
    });
  } catch (err) {
    next(err);
  }
});

// In-app "switch to another module" widget: proxies to the portal's server-to-server
// SSO endpoints (portal is the source of truth for who can open what). The email comes
// from the real session, never from the request.
const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.smartesek.com';
const THIS_MODULE_KEY = 'TASKS';

async function callPortal(path, email, extra = {}) {
  const callerToken = jwt.sign({ email }, process.env.SSO_SHARED_SECRET, { expiresIn: '30s' });
  const portalRes = await fetch(`${PORTAL_URL}/api/sso/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: callerToken, ...extra }),
  });
  return { ok: portalRes.ok, status: portalRes.status, data: await portalRes.json() };
}

router.get('/switcher/modules', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!process.env.SSO_SHARED_SECRET) return res.status(500).json({ error: 'sso-not-configured' });
  try {
    const { ok, status, data } = await callPortal('modules', req.user.email.toLowerCase());
    if (!ok) return res.status(status).json(data);
    res.json({
      modules: (data.modules || []).filter((m) => String(m.key).toUpperCase() !== THIS_MODULE_KEY),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/switcher/token', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!process.env.SSO_SHARED_SECRET) return res.status(500).json({ error: 'sso-not-configured' });
  const { moduleKey } = req.body || {};
  if (!moduleKey) return res.status(400).json({ error: 'missing-module-key' });
  try {
    const { ok, status, data } = await callPortal('token-for', req.user.email.toLowerCase(), { moduleKey });
    if (!ok) return res.status(status).json(data);
    const sep = data.baseUrl.includes('?') ? '&' : '?';
    res.json({ redirectUrl: `${data.baseUrl}${sep}sso_token=${encodeURIComponent(data.ssoToken)}` });
  } catch (err) {
    next(err);
  }
});

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
