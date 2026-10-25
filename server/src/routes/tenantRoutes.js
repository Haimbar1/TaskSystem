import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireTenant } from '../middleware/tenant.js';
import { getEmbedToken, rotateEmbedToken, clearEmbedToken, isEmbedUser } from '../embed.js';
import { whatsappCredentials, writeToVault, forgetVaultCache } from '../tenantSecrets.js';
import { listWhatsAppSystemAccounts, moveAccountToVault } from '../services/whatsappSystemAccounts.js';
import { listMessages, statusForwardUrl } from '../services/whatsappLog.js';
import { listPhoneNumbers, listApprovedTemplates, wabaOfPhone } from '../services/whatsapp.js';
import {
  TEMPLATE_EVENTS,
  TEMPLATE_FIELDS,
  DEFAULT_TEMPLATES,
  getTemplateSettings,
  setTemplateSettings,
} from '../services/whatsappTemplates.js';
import { getStatuses, setStatuses, STATUS_COLORS } from '../services/taskStatuses.js';
import { recordAction, listActions } from '../services/auditLog.js';
import { defaultMessageLink, getMessageLinkSetting, setMessageLinkSetting } from '../services/messageLink.js';
import { getCheckSettings, setCheckHour, runOverdueCheck } from '../services/overdueCheck.js';

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
  const { values, sources, linked, label } = await whatsappCredentials(tenantId);
  // The WABA's numbers as Meta has them, to flag a Phone Number ID that isn't one of them (it then
  // sends from a number other than the WABA's, or fails). [] when Meta can't list them: no warning.
  const wabaNumbers =
    values.whatsapp_access_token && values.whatsapp_waba_id
      ? await listPhoneNumbers({ accessToken: values.whatsapp_access_token, wabaId: values.whatsapp_waba_id })
      : [];
  const phoneNotInWaba =
    wabaNumbers.length > 0 &&
    !!values.whatsapp_phone_number_id &&
    !wabaNumbers.some((n) => n.id === values.whatsapp_phone_number_id);
  return {
    waba_numbers: wabaNumbers.map((n) => ({ id: n.id, display_phone_number: n.display_phone_number || '' })),
    phone_not_in_waba: phoneNotInWaba,
    // the WABA the number is really in, to offer instead of the saved one
    phone_waba_id: phoneNotInWaba
      ? (await wabaOfPhone({
          accessToken: values.whatsapp_access_token,
          phoneNumberId: values.whatsapp_phone_number_id,
        })) || ''
      : '',
    whatsapp_access_token_set: !!values.whatsapp_access_token,
    whatsapp_phone_number_id: values.whatsapp_phone_number_id || '',
    whatsapp_waba_id: values.whatsapp_waba_id || '',
    // the number as people know it, and the name it was given in the portal
    display_phone_number:
      label?.displayPhone ||
      wabaNumbers.find((n) => n.id === values.whatsapp_phone_number_id)?.display_phone_number ||
      '',
    number_name: label?.name || '',
    message_link_url: await getMessageLinkSetting(tenantId),
    default_message_link: defaultMessageLink(),
    sources,
    linked,
    portal_secrets_url: linked ? await portalSecretsUrl(tenantId) : '',
    ...extra,
  };
}

const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.smartesek.com';
async function portalSecretsUrl(tenantId) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  const portalId = rows[0]?.portal_tenant_id;
  return portalId ? `${PORTAL_URL}/tenants/${portalId}/secrets` : PORTAL_URL;
}

// A business linked to the portal gets its WhatsApp (token / number / WABA) from the portal only
// (Haim, 2026-10-25): the form here saved whatever its fields held — the browser even filled the
// token field with an old saved one — every time just the message link was saved, and kept putting
// an old number and token back over the portal's.
async function isPortalLinked(tenantId) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return !!rows[0]?.portal_tenant_id;
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
  if (await isPortalLinked(req.tenantId)) {
    await recordAction(req, { action: 'settings_changed', details: 'קישור למשימה בהודעות' });
    return res.json(await whatsappSettingsResponse(req.tenantId));
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

// The overdue check's hour (Israel time) and "בדוק עכשיו" — see services/overdueCheck.js.
router.get('/overdue-check', requireAuth, requireTenant, requireTenantAdminOrEmbed, async (req, res) => {
  res.json(await getCheckSettings(req.tenantId));
});

router.put('/overdue-check', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  const error = await setCheckHour(req.tenantId, req.body?.hour);
  if (error) return res.status(400).json({ error });
  await recordAction(req, {
    action: 'settings_changed',
    details: `שעת בדיקת משימות באיחור: ${String(req.body.hour).padStart(2, '0')}:00`,
  });
  res.json(await getCheckSettings(req.tenantId));
});

router.post('/overdue-check/run', requireAuth, requireTenant, requireTenantAdmin, async (req, res) => {
  try {
    const result = await runOverdueCheck(req.tenantId);
    res.json({ ...result, ...(await getCheckSettings(req.tenantId)) });
  } catch (err) {
    console.error('POST /api/tenants/overdue-check/run failed:', err);
    res.status(500).json({ error: 'הבדיקה נכשלה — נסו שוב' });
  }
});

// Super admin: every WhatsApp number the businesses' WABAs hold (this one included), as Meta shows
// it, to move one into the active business by the number people know. A WABA several businesses
// share is listed once. A business whose numbers Meta won't list still shows, by its Phone Number ID.
// Then the numbers only the WhatsApp system's account lists hold (whatsappSystemAccounts.js),
// marked origin 'whatsapp' — those are moved through it, never with a token here.
// Only this business's own numbers and עסק חכם's (Haim, 2026-10-25: "רק מהעסק שלו ומעסק חכם") —
// choosing one of עסק חכם's makes the portal hand it over with עסק חכם's token, without touching
// this business's own number (portal secrets/whatsappAccounts.js).
const PLATFORM_PORTAL_TENANT = Number(process.env.PLATFORM_TENANT_ID || 3);
const allowedSource = (t, activeId) => t.id === activeId || Number(t.portal_tenant_id) === PLATFORM_PORTAL_TENANT;

router.get('/whatsapp-sources', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  // SELECT * so this works where portal_tenant_id hasn't been added yet (portalProvision.js).
  const all = (await pool.query('SELECT * FROM tenants ORDER BY id = $1 DESC, name', [req.tenantId])).rows;
  const rows = all.filter((t) => allowedSource(t, req.tenantId));
  const myPortalId = Number(all.find((t) => t.id === req.tenantId)?.portal_tenant_id) || null;
  const sources = [];
  const seen = new Set();
  for (const t of rows) {
    const { values, label } = await whatsappCredentials(t.id);
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
        // the name given to the number in the portal
        account_name: n.id === values.whatsapp_phone_number_id ? label?.name || '' : '',
      });
    }
  }
  const nameByPortalId = new Map(rows.filter((t) => t.portal_tenant_id).map((t) => [Number(t.portal_tenant_id), t.name]));
  for (const a of await listWhatsAppSystemAccounts()) {
    // only this business's own: a move from here replaces the business's own number and token,
    // while עסק חכם's numbers come through the portal (listed above from its row)
    const owner = Number(a.tenant) || null;
    if (!myPortalId || owner !== myPortalId) continue;
    if (seen.has(a.phoneNumberId)) {
      // Already listed from a business here: show it by the number and name the WhatsApp system knows.
      const listed = sources.find((s) => s.whatsapp_phone_number_id === a.phoneNumberId);
      listed.display_phone_number ||= a.displayPhoneNumber;
      listed.verified_name ||= a.verifiedName;
      listed.account_name ||= a.name;
      continue;
    }
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
  if ((Number(account.tenant) || null) !== portalId) {
    return res.status(400).json({ error: 'מכאן אפשר לבחור רק מספר של העסק הזה. את המספר של עסק חכם בוחרים ברשימה (או בפורטל)' });
  }
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
  // tenants ids are UUIDs — Number() made every move fail with "בחרו מספר"
  const sourceId = String(req.body?.sourceTenantId || '');
  const phoneNumberId = String(req.body?.phoneNumberId || '');
  if (phoneNumberId && req.body?.origin === 'whatsapp') return takeFromWhatsAppSystem(req, res, phoneNumberId);
  if (!sourceId || !phoneNumberId) return res.status(400).json({ error: 'בחרו מספר' });
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [sourceId]);
  if (!rows[0]) return res.status(404).json({ error: 'העסק לא נמצא' });
  if (!allowedSource(rows[0], req.tenantId)) return res.status(400).json({ error: 'אפשר לבחור רק מספר של העסק הזה או של עסק חכם' });
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

// Which Meta template each message goes out on, and what fills its variables
// (services/whatsappTemplates.js). Super admin, like the rest of the WhatsApp settings. GET also
// returns the business's WABA's approved templates to choose from.
router.get('/whatsapp-templates', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const { values, sources } = await whatsappCredentials(req.tenantId);
  // Templates come from the WABA the sending number is in (wabaOfPhone) — a template from any other
  // WABA fails to send with "does not exist or isn't approved".
  const phoneWaba = await wabaOfPhone({
    accessToken: values.whatsapp_access_token,
    phoneNumberId: values.whatsapp_phone_number_id,
    wabaId: values.whatsapp_waba_id,
  });
  const templatesWaba = phoneWaba || values.whatsapp_waba_id;
  const approved = await listApprovedTemplates({ accessToken: values.whatsapp_access_token, wabaId: templatesWaba });
  // Meta's "does not exist / missing permissions" on the WABA = the token can't see this WABA. Say
  // so in plain words, with where each value comes from (the token and WABA ID may come from
  // different places — see tenantSecrets.js).
  if (approved.error && /does not exist|missing permissions/i.test(approved.error)) {
    const where = { env: 'הגדרות השרת (Vercel)', vault: 'הפורטל ("מזהים וחיבורים")', local: 'מערכת המשימות' };
    approved.error =
      `ה-Access Token השמור לא מקבל גישה ל-WABA ${templatesWaba}. ` +
      `הטוקן מגיע מ${where[sources.whatsapp_access_token] || '—'} וה-WABA ID מ${where[sources.whatsapp_waba_id] || '—'}. ` +
      'צריך טוקן של ה-Meta Business שה-WABA הזה שייך לו (System User עם ההרשאות whatsapp_business_messaging ' +
      'ו-whatsapp_business_management על ה-WABA) — מדביקים אותו בשדה Access Token ושומרים.';
  }
  res.json({
    events: TEMPLATE_EVENTS,
    fields: Object.fromEntries(Object.entries(TEMPLATE_FIELDS).map(([key, f]) => [key, f.label])),
    defaults: DEFAULT_TEMPLATES,
    settings: await getTemplateSettings(req.tenantId),
    approved: approved.templates || [],
    approved_error: approved.error || '',
    templates_waba_id: templatesWaba || '',
    saved_waba_id: values.whatsapp_waba_id || '',
    // the saved WABA ID names a WABA the sending number isn't in
    waba_mismatch: Boolean(phoneWaba && values.whatsapp_waba_id && phoneWaba !== values.whatsapp_waba_id),
  });
});

router.put('/whatsapp-templates', requireAuth, requireTenant, requireSuperAdmin, async (req, res) => {
  const error = await setTemplateSettings(req.tenantId, req.body?.settings);
  if (error) return res.status(400).json({ error });
  const settings = await getTemplateSettings(req.tenantId);
  await recordAction(req, {
    action: 'settings_changed',
    details:
      'תבניות וואטסאפ: ' +
      TEMPLATE_EVENTS.map((e) => `${e.label} — ${(settings[e.key] || DEFAULT_TEMPLATES[e.key]).name}`).join(', '),
  });
  res.json({ settings });
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
