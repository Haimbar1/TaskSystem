import { useEffect, useState } from 'react';

// Short notice after saving a task: whose WhatsApp message Meta accepted (and whose it refused).
// Accepted is not delivered — Meta reports delivery later, only through a webhook. Fed by api.js's 'whatsapp-sent' event; disappears on its own.
export default function WhatsAppSentToast() {
  const [messages, setMessages] = useState(null);
  // A task saved in the background (TaskFormModal) that failed — stays until closed
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const onFailed = (e) => setSaveError(e.detail);
    window.addEventListener('task-save-failed', onFailed);
    return () => window.removeEventListener('task-save-failed', onFailed);
  }, []);

  useEffect(() => {
    let timer;
    function onSent(e) {
      setMessages(e.detail);
      clearTimeout(timer);
      // a held message stays a little longer, so the "not sent yet" is read
      timer = setTimeout(() => setMessages(null), e.detail?.some((m) => m.queued) ? 12000 : 6000);
    }
    window.addEventListener('whatsapp-sent', onSent);
    return () => {
      window.removeEventListener('whatsapp-sent', onSent);
      clearTimeout(timer);
    };
  }, []);

  if (saveError) {
    return (
      <div dir="rtl" role="alert" className="fixed top-16 right-4 z-50 max-w-sm bg-red-50 border border-red-300 rounded-lg shadow-lg p-3 text-sm space-y-1">
        <div className="text-red-700 font-medium">{saveError}</div>
        <button onClick={() => setSaveError('')} className="text-gray-500 text-xs">
          סגור
        </button>
      </div>
    );
  }

  if (!messages?.length) return null;

  const names = (list) => [...new Set(list.map((m) => m.recipientName || m.to))].join(', ');
  const sent = messages.filter((m) => m.sent);
  // Held by the server outside the send window (Sun–Thu 08:00–17:00, not holidays) — not sent yet.
  const queued = messages.filter((m) => m.queued);
  const failed = messages.filter((m) => !m.sent && !m.queued);

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed top-16 right-4 z-50 max-w-sm bg-white border rounded-lg shadow-lg p-3 text-sm space-y-1"
    >
      {sent.length > 0 && (
        <div>
          <span className="text-emerald-700 font-medium">הודעת וואטסאפ נשלחה ל-Meta עבור: </span>
          {names(sent)}
        </div>
      )}
      {queued.length > 0 && (
        <div>
          <span className="text-amber-700 font-medium">
            ההודעה לא נשלחה עדיין — מחוץ לשעות השליחה (א׳–ה׳ 08:00–17:00), נכנסה לתור ותישלח {queued[0].sendAt} אל:{' '}
          </span>
          {names(queued)}
        </div>
      )}
      {failed.length > 0 && (
        <div>
          <span className="text-red-600 font-medium">שליחת וואטסאפ נכשלה אל: </span>
          {names(failed)}
        </div>
      )}
      <button onClick={() => setMessages(null)} className="text-gray-400 text-xs">
        סגור
      </button>
    </div>
  );
}
