import { pool } from '../db.js';
import { WHATSAPP_TEMPLATES } from './whatsappTemplates.js';
import { STATUS_LABELS } from '../labels.js';
import { formatDate } from '../dateFormat.js';
import { whatsappCredentials } from '../tenantSecrets.js';

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

// Builds and sends the WhatsApp message for one recipient/event. Returns null when there's
// nothing to send (no phone on file, no template for this event type, or the business has no
// WhatsApp details) — otherwise what was sent: { to, recipientName, templateName, params, text, sent }.
export async function sendWhatsAppMessage({ tenantId, userId, eventType, task, extra = {} }) {
  const { rows: userRows } = await pool.query('SELECT name, phone FROM users WHERE id = $1', [userId]);
  const recipient = userRows[0];
  if (!recipient?.phone) return null;

  const template = WHATSAPP_TEMPLATES[eventType];
  if (!template) return null;

  // The portal vault's values (see tenantSecrets.js); only the original business falls back to env.
  const { values: tenantCreds } = await whatsappCredentials(tenantId);
  const accessToken = tenantCreds.whatsapp_access_token;
  const phoneNumberId = tenantCreds.whatsapp_phone_number_id;
  if (!accessToken || !phoneNumberId) return null;

  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/`; // TODO: per-task deep link once a task detail page exists
  const params = template.buildParams({
    recipientName: recipient.name || '',
    task,
    dueDate: formatDate(task.due_date),
    statusLabel: STATUS_LABELS[task.status] || task.status,
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
    message.sent = res.ok;
    if (!res.ok) console.error('WhatsApp send failed', message.to, message.templateName, await res.text());
  } catch (err) {
    // a WhatsApp outage must never fail the task save that triggered it
    console.error('WhatsApp send failed', message.to, message.templateName, err?.message);
  }

  return message;
}
