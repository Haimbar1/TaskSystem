import { Router } from 'express';
import { pool } from '../db.js';
import { EMBED_USER_EMAIL } from '../embed.js';

const router = Router();

// The embed service user (see embed.js) isn't a person, so it's never listed or assignable.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, phone, role FROM users WHERE tenant_id = $1 AND email <> $2',
    [req.tenantId, EMBED_USER_EMAIL]
  );
  res.json(rows);
});

// Admin-only: pre-creates a user row so that person can sign in with Google
// afterwards (see auth/googleStrategy.js — it refuses unknown emails).
// Phone is required — it's the only way notifications.js/whatsapp.js can
// reach this person, since WhatsApp sends are silently skipped without one.
router.post('/invite', async (req, res) => {
  // req.tenantId already reflects whichever business a super admin has
  // switched to (see middleware/tenant.js) — so this always creates the
  // user in that business, no separate "which tenant" field needed.
  if (req.user.role !== 'admin' && !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Admins only' });
  }
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

// Admin-only: updates an existing user's name/phone. Email is left alone
// here — it's the identity key Google login matches on (see
// auth/googleStrategy.js), so changing it isn't part of this simple edit.
router.patch('/:id', async (req, res) => {
  if (req.user.role !== 'admin' && !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Admins only' });
  }
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
