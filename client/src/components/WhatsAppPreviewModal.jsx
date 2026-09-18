import { useEffect, useState } from 'react';

// Global popup for reviewing WhatsApp message previews before real sending
// is switched on server-side (see server/src/services/whatsapp.js) — shows
// exactly the template name and resolved {{n}} values for each recipient.
export default function WhatsAppPreviewModal() {
  const [previews, setPreviews] = useState(null);

  useEffect(() => {
    function onPreview(e) {
      setPreviews(e.detail);
    }
    window.addEventListener('whatsapp-preview', onPreview);
    return () => window.removeEventListener('whatsapp-preview', onPreview);
  }, []);

  if (!previews?.length) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div dir="rtl" className="bg-white rounded p-4 w-full max-w-md space-y-3 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold">תצוגה מקדימה — הודעות וואטסאפ (לא נשלחות בפועל)</h2>
        {previews.map((p, i) => (
          <div key={i} className="border rounded p-3 bg-gray-50 space-y-1">
            <div className="text-sm text-gray-500">
              אל: {p.to} · תבנית: <code>{p.templateName}</code>
            </div>
            <div className="text-sm text-gray-500">
              משתנים: {p.params.map((v, j) => `{{${j + 1}}}=${v}`).join(', ')}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm bg-white border rounded p-2">{p.text}</pre>
          </div>
        ))}
        <div className="flex justify-end">
          <button onClick={() => setPreviews(null)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
