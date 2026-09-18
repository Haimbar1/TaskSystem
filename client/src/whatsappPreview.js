// No real WhatsApp send yet (see server/src/services/whatsapp.js) — every
// place that creates/updates a task gets back a `whatsappPreviews` array and
// hands it here so the resolved message can be checked visually.
export function showWhatsAppPreview(previews) {
  if (!previews?.length) return;
  window.dispatchEvent(new CustomEvent('whatsapp-preview', { detail: previews }));
}
