import { pool } from '../db.js';
import { WHATSAPP_TEMPLATES } from './whatsappTemplates.js';
import { getStatuses, statusLabel } from './taskStatuses.js';
import { formatDate } from '../dateFormat.js';
import { whatsappCredentials } from '../tenantSecrets.js';
import { recordMessage } from './whatsappLog.js';
import { taskLinkFor } from '../routes/openTaskRoutes.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v20.0';

// A business with WhatsApp details (token + Phone Number ID — the portal vault, see
// tenantSecrets.js) sends every notification for real through the Meta Cloud API; a business
// without them simply gets no WhatsApp messages.

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
  const template = WHATSAPP_TEMPLATES[eventType];
  if (!template) return null;

  // The portal vault's values (see tenantSecrets.js); only the original business falls back to env.
  const { values: tenantCreds } = await whatsappCredentials(tenantId);
  const accessToken = tenantCreds.whatsapp_access_token;
  const phoneNumberId = tenantCreds.whatsapp_phone_number_id;
  if (!accessToken || !phoneNumberId) return null;

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

  // Opens this task: a 2-day signed link for a business that works through Monday, else a plain one.
  const link = await taskLinkFor({ tenantId, taskId: task.id, userId });
  const params = template.buildParams({
    recipientName: recipient.name || '',
    task,
    dueDate: formatDate(task.due_date),
    statusLabel: statusLabel(await getStatuses(tenantId), task.status),
    link,
    ...extra,
  });

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
          language: { code: 'he' },
          components: [
            { type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) },
          ],
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
