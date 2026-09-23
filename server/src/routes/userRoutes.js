import { Router } from 'express';
import { pool } from '../db.js';
import { EMBED_USER_EMAIL, getEmbedToken } from '../embed.js';

const router = Router();

// Users are managed in the portal. The exception is an embedded business (see embed.js): its
// people never log in through the portal, so a super admin adds and edits them here instead.
async function requireEmbedUserAdmin(req, res, next) {
  if (!req.user.is_super_admin) return res.status(403).json({ error: 'Super admins only' });
  if (!(await getEmbedToken(req.tenantId))) {
    return res.status(403).json({ error: 'Users of this business are managed in the portal' });
  }
  next();
}

// The embed service user (see embed.js) isn't a person, so it's never listed or assignable.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, phone, role FROM users WHERE tenant_id = $1 AND email <> $2',
    [req.tenantId, EMBED_USER_EMAIL]
  );
  res.json(rows);
});

// Pre-creates a user row (see requireEmbedUserAdmin for who may).
// Phone is required — it's the only way notifications.js/whatsapp.js can
// reach this person, since WhatsApp sends are silently skipped without one.
router.post('/invite', requireEmbedUserAdmin, async (req, res) => {
  // req.tenantId already reflects whichever business a super admin has
  // switched to (see middleware/tenant.js) — so this always creates the
  // user in that business, no separate "which tenant" field needed.
  const { email, name, phone } = req.body;
  if (!email || !phone) {
    return res.status(400).json({ error: 'email and phone are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (tenant_id, email, name, phone, role)
       VALUES ($1, $2, $3, $4, 'member') RETURNING id, name, email, phone, role`,
      [req.tenantId, email, name, phone]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    throw err;
  }
});

// Updates an existing user's name/phone (see requireEmbedUserAdmin for who may). Email is left
// alone here — it's the identity key Google login matches on (see
// auth/googleStrategy.js), so changing it isn't part of this simple edit.
router.patch('/:id', requireEmbedUserAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  const { rows } = await pool.query(
    `UPDATE users SET name = $1, phone = $2 WHERE id = $3 AND tenant_id = $4
     RETURNING id, name, email, phone, role`,
    [name, phone, id, req.tenantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

export default router;
