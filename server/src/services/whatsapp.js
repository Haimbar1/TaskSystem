import { pool } from '../db.js';
import { templateFor } from './whatsappTemplates.js';
import { getStatuses, statusLabel } from './taskStatuses.js';
import { formatDate } from '../dateFormat.js';
import { whatsappCredentials } from '../tenantSecrets.js';
import { recordMessage } from './whatsappLog.js';
import { taskLinkFor } from '../routes/openTaskRoutes.js';
import { inSendWindow, nextSendTime, formatSendTime } from './sendWindow.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v20.0';

// A business with WhatsApp details (token + Phone Number ID — the portal vault, see
// tenantSecrets.js) sends every notification for real through the Meta Cloud API; a business
// without them simply gets no WhatsApp messages.

// The phone numbers a business's token can send from, as Meta shows them (for picking a WABA by
// the number people know): [{ id, display_phone_number, verified_name }]. Lists every number in the
// WABA when its ID is known, else just the one Phone Number ID. [] when Meta can't be reached.
export async function listPhoneNumbers({ accessToken, wabaId, phoneNumberId }) {
  const fields = 'display_phone_number,verified_name';
  const headers = { Authorization: `Bearer ${accessToken}` };
  try {
    if (wabaId) {
      const res = await fetch(`${GRAPH_API_URL}/${wabaId}/phone_numbers?fields=${fields}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.data) && data.data.length) return data.data;
    }
    if (!phoneNumberId) return [];
    const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}?fields=${fields}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.id ? [data] : [];
  } catch (err) {
    console.warn('[whatsapp] listing phone numbers failed:', err?.message);
    return [];
  }
}

// The WABA a phone number really belongs to, as Meta has it. A template only sends from a number
// of the WABA it was approved in (else Meta: 132001 "does not exist"), so the template list must
// come from this WABA — not from a saved WABA ID that may name another one (Haim, 2026-10-24:
// עסק חכם's number is in WABA 4163610273938786, its saved WABA ID was Haim Bar's). Tries the saved
// WABA first, then every WABA the token is granted. null = Meta didn't say.
export async function wabaOfPhone({ accessToken, phoneNumberId, wabaId }) {
  if (!accessToken || !phoneNumberId) return null;
  const holds = async (id) => (await listPhoneNumbers({ accessToken, wabaId: id })).some((n) => n.id === phoneNumberId);
  if (wabaId && (await holds(wabaId))) return wabaId;
  try {
    const res = await fetch(
      `${GRAPH_API_URL}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json().catch(() => ({}));
    const candidates = new Set();
    for (const s of data?.data?.granular_scopes || []) {
      if (s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging') {
        for (const id of s.target_ids || []) if (id !== wabaId) candidates.add(String(id));
      }
    }
    for (const id of candidates) if (await holds(id)) return id;
  } catch (err) {
    console.warn('[whatsapp] finding the number\'s WABA failed:', err?.message);
  }
  return null;
}

// The WABA's approved templates the task system can send: only ones whose variables are all in the
// body (a header or button variable, or a media header, needs values it can't fill). Returns
// { templates: [{ id, name, language, category, body, header, footer, buttons }] } or { error } (Meta's message).
export async function listApprovedTemplates({ accessToken, wabaId }) {
  if (!accessToken || !wabaId) return { error: 'חסרים Access Token או WABA ID' };
  try {
    const res = await fetch(
      `${GRAPH_API_URL}/${wabaId}/message_templates?fields=name,language,status,category,components&limit=250`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error?.error_user_msg || data?.error?.message || `HTTP ${res.status}` };
    const templates = [];
    for (const t of data.data || []) {
      if (t.status !== 'APPROVED') continue;
      const components = t.components || [];
      const body = components.find((c) => c.type === 'BODY')?.text || '';
      const header = components.find((c) => c.type === 'HEADER');
      const buttons = components.find((c) => c.type === 'BUTTONS')?.buttons || [];
      if (header && (header.format !== 'TEXT' || /\{\{/.test(header.text || ''))) continue;
      if (buttons.some((b) => /\{\{/.test(b.url || '') || b.type === 'COPY_CODE' || b.type === 'OTP')) continue;
      // header / footer / buttons only for the settings screen's preview — the send fills the body alone
      templates.push({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        body,
        header: header?.text || '',
        footer: components.find((c) => c.type === 'FOOTER')?.text || '',
        buttons: buttons.map((b) => b.text).filter(Boolean),
      });
    }
    templates.sort((a, b) => a.name.localeCompare(b.name));
    return { templates };
  } catch (err) {
    return { error: err?.message || 'Meta לא זמינה' };
  }
}

// Meta wants the number in international form, digits only: 050-1234567 → 972501234567.
function toWhatsAppNumber(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

// Builds and sends the WhatsApp message for one recipient/event, and writes it to the outgoing log
// (whatsappLog.js). Returns null when there's nothing to send (no template for this event type,
// the business has no WhatsApp details, or no phone on file — that last one is still logged as
// "not sent") — otherwise what was sent: { to, recipientName, templateName, params, text, sent }.
export async function sendWhatsAppMessage({ tenantId, userId, eventType, task, extra = {} }) {
  // The business's chosen template for this message, else the default (whatsappTemplates.js).
  const template = await templateFor(tenantId, eventType);
  if (!template) return null;

  // The portal vault's values (see tenantSecrets.js); only the original business falls back to env.
  const { values: tenantCreds, sources: credSources } = await whatsappCredentials(tenantId);
  const accessToken = tenantCreds.whatsapp_access_token;
  const phoneNumberId = tenantCreds.whatsapp_phone_number_id;
  if (!accessToken || !phoneNumberId) return null;
  // Added to a failed send's error in the log: exactly what was sent to Meta, to find a mismatch
  // (a template from another WABA, a number from another WABA, a token from elsewhere).
  const SOURCE = { env: 'Vercel', vault: 'הפורטל', local: 'מערכת המשימות' };
  const sentWith = () =>
    `[Phone Number ID ${phoneNumberId} · WABA ${tenantCreds.whatsapp_waba_id || '—'} · ` +
    `תבנית ${template.name} (${template.language}) · ` +
    `טוקן …${String(accessToken).slice(-6)} מ${SOURCE[credSources.whatsapp_access_token] || '—'}]`;

  const { rows: userRows } = await pool.query('SELECT name, phone, tenant_id FROM users WHERE id = $1', [userId]);
  const recipient = userRows[0];
  // Only the business's own people: the platform owner working inside another business (e.g. as
  // the creator of its tasks) gets no WhatsApp about it.
  if (recipient && recipient.tenant_id !== tenantId) return null;
  const logBase = {
    tenantId,
    taskId: task.id,
    taskTitle: task.title,
    userId,
    recipientName: recipient?.name || '',
    eventType,
    templateName: template.name,
  };
  if (!recipient?.phone) {
    await recordMessage({ ...logBase, status: 'skipped', error: 'אין מספר טלפון למשתמש' });
    return null;
  }

  // Outside the send window (sendWindow.js): held, not sent — flushQueue sends it at the first slot.
  if (!inSendWindow()) {
    await queueMessage({ tenantId, userId, eventType, taskId: task.id, extra });
    return {
      to: toWhatsAppNumber(recipient.phone),
      recipientName: recipient.name || '',
      templateName: template.name,
      params: [],
      text: '',
      sent: false,
      queued: true,
      sendAt: formatSendTime(nextSendTime()),
    };
  }

  // Opens this task: a 2-day signed link for a business that works through Monday, else a plain one.
  const link = await taskLinkFor({ tenantId, taskId: task.id, userId });
  // Trimmed: a value ending in a space (e.g. a title typed as "בדיקות. ") breaks WhatsApp's *bold*
  // around it in the template, since "*text *" isn't bold.
  const params = template.buildParams({
    recipientName: recipient.name || '',
    task,
    dueDate: formatDate(task.due_date),
    statusLabel: statusLabel(await getStatuses(tenantId), task.status),
    link,
    ...extra,
  }).map((value) => String(value ?? '').trim());

  const message = {
    to: toWhatsAppNumber(recipient.phone),
    recipientName: recipient.name || '',
    templateName: template.name,
    params,
    text: template.render(params),
    sent: false,
  };

  let wamid = null;
  let error = null;
  try {
    const res = await fetch(`${GRAPH_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: 'template',
        template: {
          name: message.templateName,
          language: { code: template.language },
          // a template without variables takes no body parameters at all
          components: params.length
            ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }]
            : [],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    message.sent = res.ok;
    // Meta's id for the message — accepted is not delivered; the status webhook reports that later.
    if (res.ok) wamid = data?.messages?.[0]?.id || null;
    else {
      const e = data?.error;
      error = e
        ? [e.code && `(${e.code})`, e.error_user_msg || e.message, e.error_data?.details].filter(Boolean).join(' ')
        : `HTTP ${res.status}`;
      error = `${error} ${sentWith()}`;
      console.error('WhatsApp send failed', message.to, message.templateName, error);
    }
  } catch (err) {
    // a WhatsApp outage must never fail the task save that triggered it
    error = err?.message || 'network error';
    console.error('WhatsApp send failed', message.to, message.templateName, error);
  }

  await recordMessage({
    ...logBase,
    to: message.to,
    text: message.text,
    wamid,
    status: message.sent ? 'accepted' : 'failed',
    error,
  });
  return message;
}

// Messages held outside the send window, one row per task and recipient: a second update for the
// same task before the window opens joins the first one (its changes added to the summary), so the
// person gets one message. The task's details (title, status, link) are read again when it's sent.
const CREATE_QUEUE = `
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  extra JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);`;

let queueReady = false;
async function ensureQueue() {
  if (queueReady) return;
  await pool.query(CREATE_QUEUE);
  queueReady = true;
}

// "הועברה לטיפולך" beats a status change, which beats any other change (as in notifications.js).
const EVENT_RANK = { field_changed: 0, status_changed: 1, assigned: 2 };
const joinText = (a, b, sep) =>
  [...new Set([a, b].flatMap((s) => String(s || '').split(sep)).filter(Boolean))].join(sep);

async function queueMessage({ tenantId, userId, eventType, taskId, extra = {} }) {
  await ensureQueue();
  const { rows } = await pool.query(
    'SELECT id, event_type, extra FROM whatsapp_queue WHERE task_id = $1 AND user_id = $2',
    [taskId, userId]
  );
  const was = rows[0];
  if (!was) {
    await pool.query(
      `INSERT INTO whatsapp_queue (tenant_id, task_id, user_id, event_type, extra) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (task_id, user_id) DO UPDATE SET event_type = EXCLUDED.event_type, extra = EXCLUDED.extra`,
      [tenantId, taskId, userId, eventType, JSON.stringify(extra)]
    );
    return;
  }
  const merged = { ...was.extra, ...extra };
  if (was.extra.changeSummary || extra.changeSummary) {
    merged.changeSummary = joinText(was.extra.changeSummary, extra.changeSummary, ' · ').slice(0, 900);
  }
  if (was.extra.changedByName || extra.changedByName) {
    merged.changedByName = joinText(was.extra.changedByName, extra.changedByName, ', ');
  }
  const type = (EVENT_RANK[eventType] ?? 0) >= (EVENT_RANK[was.event_type] ?? 0) ? eventType : was.event_type;
  await pool.query('UPDATE whatsapp_queue SET event_type = $2, extra = $3 WHERE id = $1', [
    was.id,
    type,
    JSON.stringify(merged),
  ]);
}

// Run by the hourly cron (routes/cronRoutes.js): inside the send window, sends every held message.
// The rows leave the queue before they're sent, so overlapping runs don't both send one.
export async function flushQueue() {
  if (!inSendWindow()) return { sent: 0, failed: 0 };
  await ensureQueue();
  const { rows } = await pool.query('DELETE FROM whatsapp_queue RETURNING *');
  let sent = 0;
  let failed = 0;
  for (const row of rows.sort((a, b) => a.created_at - b.created_at)) {
    try {
      const { rows: tasks } = await pool.query('SELECT * FROM tasks WHERE id = $1', [row.task_id]);
      if (!tasks[0]) continue;
      const message = await sendWhatsAppMessage({
        tenantId: row.tenant_id,
        userId: row.user_id,
        eventType: row.event_type,
        task: tasks[0],
        extra: row.extra || {},
      });
      if (message?.sent) sent++;
      else failed++;
    } catch (err) {
      console.error('[whatsapp queue] send failed', row.id, err);
      failed++;
    }
  }
  return { sent, failed };
}
