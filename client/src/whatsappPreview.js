// Every place that creates/updates a task gets back a `whatsappPreviews` array and hands it here
// so the resolved message can be checked visually — only while the business hasn't switched on
// real sending (see server/src/services/whatsapp.js); messages that really went out (`live`)
// don't pop up.
export function showWhatsAppPreview(previews) {
  const pending = (previews || []).filter((p) => !p.live);
  if (!pending.length) return;
  window.dispatchEvent(new CustomEvent('whatsapp-preview', { detail: pending }));
}
