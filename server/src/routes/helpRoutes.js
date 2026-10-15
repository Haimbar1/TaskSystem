import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

// The help assistant ("העוזר", client/src/components/HelpWidget.tsx — the same component in every
// SmartEsek system): it explains how to use the systems. The brain is the CRM's /api/help
// (crm/server/helpBot.ts), told the question comes from the tasks system so "show me" points at
// this system's own buttons. The CRM gets a short-lived token naming the business (signed with
// SSO_SHARED_SECRET); the answer streams through as is.

const CRM_URL = (process.env.CRM_URL || 'https://crm.smartesek.com').replace(/\/$/, '');
const router = Router();

async function callHelp(req, res, path, init = {}) {
  try {
    if (!process.env.SSO_SHARED_SECRET) return res.status(500).json({ error: 'sso-not-configured' });
    // SELECT * so this works where portal_tenant_id hasn't been added yet (portalProvision.js)
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    const business = rows[0] || {};
    const token = jwt.sign(
      {
        typ: 'insights',
        portalTenantId: Number(business.portal_tenant_id) || 0,
        businessName: business.name || undefined,
        role: req.user?.is_super_admin || req.user?.role === 'admin' ? 'admin' : 'member',
        email: req.user?.email,
        name: req.user?.name,
      },
      process.env.SSO_SHARED_SECRET,
      { expiresIn: '2m' }
    );
    const r = await fetch(`${CRM_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-insights-token': token },
      signal: AbortSignal.timeout(280000), // the CRM may try several AI models in a row
    });
    res.status(r.status);
    const type = r.headers.get('content-type');
    if (type) res.setHeader('Content-Type', type);
    if (r.headers.get('cache-control')) res.setHeader('Cache-Control', r.headers.get('cache-control'));
    if (!r.body) return res.end();
    // pass the answer on piece by piece as the CRM writes it
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('help proxy failed', err);
    if (!res.headersSent) res.status(502).json({ error: 'לא הצלחתי להגיע לעוזר כרגע — נסו שוב בעוד רגע' });
    else res.end();
  }
}

router.get('/suggestions', (req, res) => callHelp(req, res, '/api/help/suggestions?module=tasks'));
router.post('/ask', (req, res) =>
  callHelp(req, res, '/api/help/ask', {
    method: 'POST',
    body: JSON.stringify({
      question: req.body?.question,
      history: req.body?.history,
      image: req.body?.image,
      device: req.body?.device,
      stream: !!req.body?.stream,
      module: 'tasks',
    }),
  })
);
router.get('/images/:id', (req, res) => callHelp(req, res, `/api/help/images/${encodeURIComponent(req.params.id)}`));

export default router;
