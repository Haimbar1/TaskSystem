import jwt from 'jsonwebtoken';

// The WhatsApp system's own account lists ("חשבונות וואטסאפ עסקי (WABA Accounts)"), which hold
// numbers the portal vault doesn't (a business can have several there, the vault only one). Read
// server-to-server through its /api/accounts-export, signed with SSO_SHARED_SECRET. Access tokens
// never come here: picking an account asks the WhatsApp system to write it into the business's
// portal vault, which whatsappCredentials (tenantSecrets.js) then reads.

const WHATSAPP_SYSTEM_URL = (process.env.WHATSAPP_SYSTEM_URL || 'https://whatsapp.smartesek.com').replace(/\/$/, '');

async function call(claims) {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret) return { ok: false, data: { error: 'sso-not-configured' } };
  const token = jwt.sign(claims, secret, { expiresIn: '30s' });
  const res = await fetch(`${WHATSAPP_SYSTEM_URL}/api/accounts-export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(10000),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

// [{ tenant (portal id), name, wabaId, wabaName, phoneNumberId, displayPhoneNumber, verifiedName }];
// [] when the WhatsApp system can't be reached (the picker still shows the vault's numbers).
export async function listWhatsAppSystemAccounts() {
  try {
    const { ok, data } = await call({ typ: 'wa-accounts' });
    if (!ok) throw new Error(data?.error || 'failed');
    return Array.isArray(data.accounts) ? data.accounts : [];
  } catch (err) {
    console.warn('[whatsapp-system] listing accounts failed:', err?.message);
    return [];
  }
}

// Writes the account with that number into the portal vault of the given portal business.
// Returns { ok, error }.
export async function moveAccountToVault(phoneNumberId, portalTenantId, byEmail) {
  try {
    const { ok, data } = await call({
      typ: 'wa-account-to-vault',
      phoneNumberId,
      targetTenant: portalTenantId,
      by: byEmail ? `${byEmail} (tasks)` : 'tasks',
    });
    return ok ? { ok: true } : { ok: false, error: data?.error || 'failed' };
  } catch (err) {
    return { ok: false, error: err?.message || 'whatsapp-system-unreachable' };
  }
}
