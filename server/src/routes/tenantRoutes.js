import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTenant } from '../middleware/tenant.js';
import { getEmbedToken, rotateEmbedToken, clearEmbedToken, isEmbedUser } from '../embed.js';
import { whatsappCredentials, writeToVault, forgetVaultCache } from '../tenantSecrets.js';
import { listWhatsAppSystemAccounts, moveAccountToVault } from '../services/whatsappSystemAccounts.js';
import { listMessages, statusForwardUrl } from '../services/whatsappLog.js';
import { listPhoneNumbers } from '../services/whatsapp.js';
import { getStatuses, setStatuses, STATUS_COLORS } from '../services/taskStatuses.js';
import { recordAction, listActions } from '../services/auditLog.js';
import { defaultMessageLink, getMessageLinkSetting, setMessageLinkSetting } from '../services/messageLink.js';

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

// Read-only screens also open inside Monday: the embed login (one shared user per business, see
// embed.js) gets the gear menu there, standing in for the business admin.
function requireTenantAdminOrEmbed(req, res, next) {
  if (isEmbedUser(req.user)) return next();
  requireTenantAdmin(req, res, next);
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
    message_link_url: await getMessageLinkSetting(tenantId),
    default_message_link: defaultMessageLink(),
    sources,
    linked,
    ...extra,
  };
}

router.get('/whatsapp-settings', requireAuth, requireTenant, requireTenantAdminOrEmbed, async (req, res) => {
  res.json(await whatsappSettingsResponse(req.tenantId, { status_forward_url: statusForwardUrl(req) }));
});

// Business admins can see the settings (GET above); only the platform owner changes them.
router.patch('/whatsapp-settings', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id, message_link_url } = req.body;
  if (message_link_url !== undefined) {
    const linkError = await setMessageLinkSetting(req.tenantId, message_link_url);
    if (linkError) return res.status(400).json({ error: linkError });
  }
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
  await recordAction(req, { action: 'settings_changed', details: 'הגדרות וואטסאפ' });
  res.json(await whatsappSettingsResponse(req.tenantId, { vault }));
});

// Super admin: every WhatsApp number the businesses' WABAs hold (this one included), as Meta shows
// it, to move one into the active business by the number people know. A WABA several businesses
// share is listed once. A business whose numbers Meta won't list still shows, by its Phone Number ID.
// Then the numbers only the WhatsApp system's account lists hold (whatsappSystemAccounts.js),
// marked origin 'whatsapp' — those are moved through it, never with a token here.
router.get('/whatsapp-sources', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  // SELECT * so this works where portal_tenant_id hasn't been added yet (portalProvision.js).
  const { rows } = await pool.query('SELECT * FROM tenants ORDER BY id = $1 DESC, name', [req.tenantId]);
  const sources = [];
  const seen = new Set();
  for (const t of rows) {
    const { values } = await whatsappCredentials(t.id);
    if (!values.whatsapp_access_token || !values.whatsapp_phone_number_id) continue;
    const numbers = await listPhoneNumbers({
      accessToken: values.whatsapp_access_token,
      wabaId: values.whatsapp_waba_id,
      phoneNumberId: values.whatsapp_phone_number_id,
    });
    const list = numbers.length ? numbers : [{ id: values.whatsapp_phone_number_id }];
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      sources.push({
        origin: 'tasks',
        tenant_id: t.id,
        tenant_name: t.name,
        whatsapp_waba_id: values.whatsapp_waba_id,
        whatsapp_phone_number_id: n.id,
        display_phone_number: n.display_phone_number || '',
        verified_name: n.verified_name || '',
      });
    }
  }
  const nameByPortalId = new Map(rows.filter((t) => t.portal_tenant_id).map((t) => [Number(t.portal_tenant_id), t.name]));
  for (const a of await listWhatsAppSystemAccounts()) {
    if (seen.has(a.phoneNumberId)) continue;
    seen.add(a.phoneNumberId);
    sources.push({
      origin: 'whatsapp',
      tenant_id: null,
      tenant_name: nameByPortalId.get(Number(a.tenant)) || (a.tenant ? `עסק ${a.tenant} בפורטל` : ''),
      account_name: a.name,
      whatsapp_waba_id: a.wabaId,
      whatsapp_phone_number_id: a.phoneNumberId,
      display_phone_number: a.displayPhoneNumber,
      verified_name: a.verifiedName,
    });
  }
  res.json({ sources });
});

// Moves a number from the WhatsApp system's account lists: it writes that account into this
// business's portal vault itself (the token never comes here), and whatsappCredentials reads it
// from there. Needs a business linked to the portal, and not the original one, which sends with
// the server's environment values first (tenantSecrets.js).
async function takeFromWhatsAppSystem(req, res, phoneNumberId) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const portalId = Number(rows[0]?.portal_tenant_id) || 0;
  if (!portalId) return res.status(400).json({ error: 'העסק לא מקושר לפורטל, אי אפשר להעביר אליו מספר ממערכת ההודעות' });
  if (portalId === Number(process.env.ORIGINAL_TENANT_ID || 1) && process.env.WHATSAPP_ACCESS_TOKEN) {
    return res.status(400).json({ error: 'העסק המקורי שולח לפי הגדרות השרת (Vercel) — שם מחליפים לו מספר' });
  }
  const account = (await listWhatsAppSystemAccounts()).find((a) => a.phoneNumberId === phoneNumberId);
  if (!account) return res.status(404).json({ error: 'המספר לא נמצא במערכת ההודעות' });
  const moved = await moveAccountToVault(phoneNumberId, portalId, req.user?.email);
  if (!moved.ok) {
    console.warn('[whatsapp-system] moving an account failed:', moved.error);
    return res.status(502).json({ error: 'ההעברה נכשלה במערכת ההודעות — נסו שוב' });
  }
  forgetVaultCache(portalId);
  // The tenants row is only a fallback behind the vault; keep it from naming the old number.
  await pool.query('UPDATE tenants SET whatsapp_phone_number_id = $1, whatsapp_waba_id = $2 WHERE id = $3', [
    phoneNumberId,
    account.wabaId || '',
    req.tenantId,
  ]);
  await recordAction(req, {
    action: 'settings_changed',
    details: `וואטסאפ: הועבר המספר ${account.displayPhoneNumber || phoneNumberId} (WABA ${account.wabaId || 'ללא מזהה'}${account.name ? `, ${account.name}` : ''}) ממערכת ההודעות`,
  });
  res.json(await whatsappSettingsResponse(req.tenantId, { vault: { ok: true } }));
}

// Takes one of those numbers into the active business: the token and WABA ID of the business it
// came from, with the chosen Phone Number ID, are saved here exactly as the settings form saves them
// (tenants row + portal vault). The other business keeps its own copy — the vault is never cleared
// from here.
router.post('/whatsapp-settings/take-from', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const sourceId = Number(req.body?.sourceTenantId);
  const phoneNumberId = String(req.body?.phoneNumberId || '');
  if (phoneNumberId && req.body?.origin === 'whatsapp') return takeFromWhatsAppSystem(req, res, phoneNumberId);
  if (!sourceId || !phoneNumberId) return res.status(400).json({ error: 'בחרו מספר' });
  const { rows } = await pool.query('SELECT name FROM tenants WHERE id = $1', [sourceId]);
  if (!rows[0]) return res.status(404).json({ error: 'העסק לא נמצא' });
  const { values: source } = await whatsappCredentials(sourceId);
  if (!source.whatsapp_access_token || !source.whatsapp_phone_number_id) {
    return res.status(400).json({ error: 'לעסק הזה אין וואטסאפ מחובר' });
  }
  // Only a number that business's WABA really holds, so a token never pairs with a foreign number.
  const numbers = await listPhoneNumbers({
    accessToken: source.whatsapp_access_token,
    wabaId: source.whatsapp_waba_id,
    phoneNumberId: source.whatsapp_phone_number_id,
  });
  const number = numbers.find((n) => n.id === phoneNumberId);
  if (!number && phoneNumberId !== source.whatsapp_phone_number_id) {
    return res.status(400).json({ error: 'המספר לא שייך ל-WABA של העסק הזה' });
  }
  const values = { ...source, whatsapp_phone_number_id: phoneNumberId };
  await pool.query(
    `UPDATE tenants SET whatsapp_access_token = $1, whatsapp_phone_number_id = $2, whatsapp_waba_id = $3 WHERE id = $4`,
    [values.whatsapp_access_token, values.whatsapp_phone_number_id, values.whatsapp_waba_id || '', req.tenantId]
  );
  const vault = await writeToVault(req.tenantId, values, req.user?.email);
  if (!vault.ok && vault.error !== 'not-linked') console.warn('[secrets] writing to the portal vault failed:', vault.error);
  await recordAction(req, {
    action: 'settings_changed',
    details: `וואטסאפ: הועבר המספר ${number?.display_phone_number || phoneNumberId} (WABA ${values.whatsapp_waba_id || 'ללא מזהה'}) מהעסק "${rows[0].name}"`,
  });
  res.json(await whatsappSettingsResponse(req.tenantId, { vault }));
});

// The active business's task statuses (services/taskStatuses.js). Everyone needs them for the
// board; only the business's admins change them.
router.get('/task-statuses', requireAuth, requireTenant, async (req, res) => {
  res.json({ statuses: await getStatuses(req.tenantId), colors: STATUS_COLORS });
});

router.put('/task-statuses', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  const result = await setStatuses(req.tenantId, req.body?.statuses);
  if (result.error) return res.status(400).json({ error: result.error });
  await recordAction(req, {
    action: 'statuses_changed',
    details: result.statuses.map((s) => s.label + (s.is_final ? ' (סיום)' : '')).join(', '),
  });
  res.json({ statuses: result.statuses, colors: STATUS_COLORS });
});

// The active business's action log, newest first (see services/auditLog.js).
router.get('/audit-log', requireAuth, requireTenant, requireTenantAdminOrEmbed, async (req, res) => {
  res.json(await listActions(req.tenantId));
});

// The active business's outgoing WhatsApp log, newest first (see services/whatsappLog.js).
router.get('/whatsapp-log', requireAuth, requireTenant, requireTenantAdminOrEmbed, async (req, res) => {
  res.json(await listMessages(req.tenantId));
});

// The active business's embed token (embedding the app in e.g. Monday; see embed.js). Super admin
// only: it's set up by the platform owner, not by the business's own admins.
// POST creates a new one, replacing the old; DELETE turns embedding off.
router.get('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  res.json({ token: await getEmbedToken(req.tenantId) });
});

router.post('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const token = await rotateEmbedToken(req.tenantId);
  await recordAction(req, { action: 'settings_changed', details: 'נוצר קישור הטמעה חדש ל-Monday' });
  res.json({ token });
});

router.delete('/embed-token', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  await clearEmbedToken(req.tenantId);
  await recordAction(req, { action: 'settings_changed', details: 'קישור ההטמעה ל-Monday בוטל' });
  res.json({ token: null });
});

export default router;
