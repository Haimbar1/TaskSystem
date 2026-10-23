import jwt from 'jsonwebtoken';
import { pool } from './db.js';

// Each business's WhatsApp Business details (token, Phone Number ID, WABA ID) live encrypted in the
// portal's vault (portal.smartesek.com → "מזהים וחיבורים"), shared with the WhatsApp system and
// BotApp so they're entered once. This reads the task system's share of them server-to-server,
// signed with SSO_SHARED_SECRET, and writes what the "הגדרות וואטסאפ" screen saves back into it.
//
// Priority, as in the other apps: the original business (the optics, portal business 1) reads
// the Vercel environment first; every business then reads the vault, then the value saved on its
// own tenants row (businesses not linked to the portal, or saved before the vault was connected).
// Only the original business ever falls back to the environment, so no other business can end up
// sending from its number.

const PORTAL_URL = process.env.PORTAL_URL || 'https://portal.smartesek.com';
const MODULE = 'tasks';
const ORIGINAL_PORTAL_TENANT = Number(process.env.ORIGINAL_TENANT_ID || 1);
const CACHE_MS = 5 * 60 * 1000;

// local column ↔ vault key ↔ environment variable
export const WHATSAPP_FIELDS = [
  { column: 'whatsapp_access_token', vaultKey: 'META_WA_ACCESS_TOKEN', env: 'WHATSAPP_ACCESS_TOKEN' },
  { column: 'whatsapp_phone_number_id', vaultKey: 'META_PHONE_NUMBER_ID', env: 'WHATSAPP_PHONE_NUMBER_ID' },
  { column: 'whatsapp_waba_id', vaultKey: 'META_WABA_ID', env: 'WHATSAPP_WABA_ID' },
];

const cache = new Map();

async function fetchFromPortal(portalTenantId) {
  const hit = cache.get(portalTenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.secrets;
  const sharedSecret = process.env.SSO_SHARED_SECRET;
  if (!sharedSecret) return {};
  try {
    const token = jwt.sign({ typ: 'secrets', tenantId: portalTenantId, module: MODULE }, sharedSecret, { expiresIn: '30s' });
    const res = await fetch(`${PORTAL_URL}/api/sso/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`portal ${res.status}`);
    const data = await res.json();
    const secrets = data?.secrets && typeof data.secrets === 'object' ? data.secrets : {};
    cache.set(portalTenantId, { at: Date.now(), secrets });
    return secrets;
  } catch (err) {
    console.warn('[secrets] reading the portal vault failed:', err?.message);
    // keep using the last good copy rather than dropping a working integration
    return hit?.secrets || {};
  }
}

// After something else wrote a business's vault values (the WhatsApp system, whatsappSystemAccounts.js).
export function forgetVaultCache(portalTenantId) {
  cache.delete(Number(portalTenantId));
}

// SELECT * so this works where portal_tenant_id hasn't been added yet (portalProvision.js).
async function tenantRow(tenantId) {
  const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return rows[0] || {};
}

// The business's effective WhatsApp details: { whatsapp_access_token, whatsapp_phone_number_id,
// whatsapp_waba_id } ('' = not set), plus where each came from (env / vault / local).
export async function whatsappCredentials(tenantId) {
  const row = await tenantRow(tenantId);
  const portalId = row.portal_tenant_id ? Number(row.portal_tenant_id) : null;
  const isOriginal = portalId === ORIGINAL_PORTAL_TENANT;
  const vault = portalId ? await fetchFromPortal(portalId) : {};
  const values = {};
  const sources = {};
  for (const f of WHATSAPP_FIELDS) {
    if (isOriginal && process.env[f.env]) {
      values[f.column] = process.env[f.env];
      sources[f.column] = 'env';
    } else if (vault[f.vaultKey]) {
      values[f.column] = vault[f.vaultKey];
      sources[f.column] = 'vault';
    } else {
      values[f.column] = row[f.column] || '';
      sources[f.column] = row[f.column] ? 'local' : '';
    }
  }
  return { values, sources, linked: !!portalId };
}

// Writes what the settings screen saved into the vault too, so the WhatsApp system / BotApp use the
// same values. Empty values are skipped (the vault is never cleared from here). Returns
// { ok, saved, error }; never throws — the local save already happened.
export async function writeToVault(tenantId, values, byEmail) {
  const row = await tenantRow(tenantId);
  const portalId = row.portal_tenant_id ? Number(row.portal_tenant_id) : null;
  const sharedSecret = process.env.SSO_SHARED_SECRET;
  if (!portalId) return { ok: false, error: 'not-linked' };
  if (!sharedSecret) return { ok: false, error: 'sso-not-configured' };
  const payload = {};
  for (const f of WHATSAPP_FIELDS) {
    const v = typeof values[f.column] === 'string' ? values[f.column].trim() : '';
    if (v) payload[f.vaultKey] = v;
  }
  if (!Object.keys(payload).length) return { ok: true, saved: [] };
  try {
    const token = jwt.sign(
      { typ: 'secrets-write', tenantId: portalId, module: MODULE, values: payload, by: byEmail || undefined },
      sharedSecret,
      { expiresIn: '30s' }
    );
    const res = await fetch(`${PORTAL_URL}/api/sso/secrets/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `portal ${res.status}` };
    cache.delete(portalId);
    return { ok: true, saved: data.saved || [], skipped: data.skipped || [] };
  } catch (err) {
    return { ok: false, error: err?.message || 'portal-unreachable' };
  }
}
