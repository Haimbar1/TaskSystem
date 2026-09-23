import { Router } from 'express';
import { pool } from '../db.js';
import { EMBED_USER_EMAIL, getEmbedToken, ensureOptionalUserEmail, isEmbedUser } from '../embed.js';

const router = Router();

// Users are managed in the portal. The exception is an embedded business (see embed.js): its
// people never log in through the portal, so they're managed here instead — by a super admin, or
// by the business itself through its embed login (always scoped to req.tenantId, its own business).
async function requireEmbedUserAdmin(req, res, next) {
  if (!req.user.is_super_admin && !isEmbedUser(req.user)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!(await getEmbedToken(req.tenantId))) {
    return res.status(403).json({ error: 'Users of this business are managed in the portal' });
  }
  next();
}

// The embed service user (see embed.js) isn't a person, so it's never listed or assignable.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, phone, role FROM users WHERE tenant_id = $1 AND email IS DISTINCT FROM $2',
    [req.tenantId, EMBED_USER_EMAIL]
  );
  res.json(rows);
});

// Creates a user row (see requireEmbedUserAdmin for who may). These people don't log in, so
// email is optional; name is required instead (it's how they're shown everywhere).
// Phone is required — it's the only way notifications.js/whatsapp.js can
// reach this person, since WhatsApp sends are silently skipped without one.
router.post('/invite', requireEmbedUserAdmin, async (req, res) => {
  // req.tenantId already reflects whichever business a super admin has
  // switched to (see middleware/tenant.js) — so this always creates the
  // user in that business, no separate "which tenant" field needed.
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }
  try {
    await ensureOptionalUserEmail();
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

// Deletes a user (see requireEmbedUserAdmin for who may). Their tasks and history stay: the
// references that don't cascade (task creator, activity log, uploaded files) are cleared first;
// assignments, watchers and notifications go with the user (ON DELETE CASCADE).
router.delete('/:id', requireEmbedUserAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND email IS DISTINCT FROM $3 FOR UPDATE',
      [id, req.tenantId, EMBED_USER_EMAIL]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    await client.query('UPDATE tasks SET created_by = NULL WHERE created_by = $1', [id]);
    await client.query('UPDATE task_activity_log SET user_id = NULL WHERE user_id = $1', [id]);
    await client.query('UPDATE task_files SET uploaded_by = NULL WHERE uploaded_by = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/users/:id failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
