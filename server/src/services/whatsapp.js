import { pool } from '../db.js';
import { WHATSAPP_TEMPLATES } from './whatsappTemplates.js';
import { STATUS_LABELS } from '../labels.js';
import { formatDate } from '../dateFormat.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v20.0';

// No verified WhatsApp Business credentials from the client yet — every
// message is built and returned as a preview (name + resolved {{n}} values)
// instead of actually being sent, so the flow can be checked visually
// before switching this on. Flip WHATSAPP_SEND_LIVE=true once real
// credentials are in and the templates are approved for this number.
const LIVE = process.env.WHATSAPP_SEND_LIVE === 'true';

// Builds (and, only in live mode, sends) the WhatsApp message for one
// recipient/event. Returns null when there's nothing to send (no phone on
// file, or no template for this event type) — otherwise the resolved
// preview: { to, templateName, params, text }.
export async function buildWhatsAppMessage({ tenantId, userId, eventType, task, extra = {} }) {
  const { rows: userRows } = await pool.query('SELECT name, phone FROM users WHERE id = $1', [userId]);
  const recipient = userRows[0];
  if (!recipient?.phone) return null;

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

  const message = { to: recipient.phone, templateName: template.name, params, text: template.render(params) };

  if (LIVE) {
    const res = await fetch(`${GRAPH_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
