import { pool } from '../db.js';
import { WHATSAPP_TEMPLATES } from './whatsappTemplates.js';
import { STATUS_LABELS } from '../labels.js';
import { formatDate } from '../dateFormat.js';
import { whatsappCredentials } from '../tenantSecrets.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v20.0';

// Real sending is switched on per business ("שליחה בפועל" in the WhatsApp settings screen,
// tenants.whatsapp_send_live). Until then every message is built and returned as a preview
// (name + resolved {{n}} values) so the flow can be checked visually; switch it on once the
// business's credentials are in and the templates are approved for its number. A business that
// never touched the switch follows WHATSAPP_SEND_LIVE (the old platform-wide setting).

// Builds (and, only when the business sends for real, sends) the WhatsApp message for one
// recipient/event. Returns null when there's nothing to send (no phone on
// file, or no template for this event type) — otherwise the resolved
// preview: { to, templateName, params, text, live }.
export async function buildWhatsAppMessage({ tenantId, userId, eventType, task, extra = {} }) {
  const { rows: userRows } = await pool.query('SELECT name, phone FROM users WHERE id = $1', [userId]);
  const recipient = userRows[0];
  if (!recipient?.phone) return null;

  // The portal vault's values (see tenantSecrets.js); only the original business falls back to env.
  const { values: tenantCreds, sendLive } = await whatsappCredentials(tenantId);
  const accessToken = tenantCreds.whatsapp_access_token;
  const phoneNumberId = tenantCreds.whatsapp_phone_number_id;
  const live = sendLive && !!accessToken && !!phoneNumberId;

  const template = WHATSAPP_TEMPLATES[eventType];
  if (!template) return null;

  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/`; // TODO: per-task deep link once a task detail page exists
  const params = template.buildParams({
    recipientName: recipient.name || '',
    task,
    dueDate: formatDate(task.due_date),
    statusLabel: STATUS_LABELS[task.status] || task.status,
    link,
    ...extra,
  });

  const message = { to: recipient.phone, templateName: template.name, params, text: template.render(params), live };

  if (live) {
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
    });
    if (!res.ok) console.error('WhatsApp send failed', await res.text());
  }

  return message;
}
