import { Router } from 'express';
import { applyStatusWebhook } from '../services/whatsappLog.js';

const router = Router();

// Delivery statuses for the outgoing log. Meta's WhatsApp webhook is already owned by the n8n
// workflow of the messages system (callback URL + verify token in its "הגדרות וואטסאפ"), so Meta
// isn't configured here: that workflow forwards the webhook body it received, unchanged, to
// POST /api/whatsapp/statuses — one address for every business. Only statuses of messages this
// system sent are used (sent / delivered / read / failed); anything else is ignored.
//
// Unsigned on purpose: a status only changes the row whose wamid — Meta's long random message
// id — matches, and only ever moves it forward.
router.post('/statuses', async (req, res) => {
  try {
    // n8n may pass Meta's body as-is or wrapped in its webhook item ({ body: … }).
    await applyStatusWebhook(req.body?.entry ? req.body : req.body?.body);
  } catch (err) {
    console.error('WhatsApp status forward failed', err?.message);
  }
  // Always 200, so the forwarding workflow never fails or retries because of us.
  res.sendStatus(200);
});

export default router;
