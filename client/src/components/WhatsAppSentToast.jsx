import { useEffect, useState } from 'react';

// Short notice after saving a task: which people just got a WhatsApp message about it (and
// whose message failed). Fed by api.js's 'whatsapp-sent' event; disappears on its own.
export default function WhatsAppSentToast() {
  const [messages, setMessages] = useState(null);

  useEffect(() => {
    let timer;
    function onSent(e) {
      setMessages(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessages(null), 6000);
    }
    window.addEventListener('whatsapp-sent', onSent);
    return () => {
      window.removeEventListener('whatsapp-sent', onSent);
      clearTimeout(timer);
    };
  }, []);

  if (!messages?.length) return null;

  const names = (list) => [...new Set(list.map((m) => m.recipientName || m.to))].join(', ');
  const sent = messages.filter((m) => m.sent);
  const failed = messages.filter((m) => !m.sent);

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed top-16 right-4 z-50 max-w-sm bg-white border rounded-lg shadow-lg p-3 text-sm space-y-1"
    >
      {sent.length > 0 && (
        <div>
          <span className="text-emerald-700 font-medium">נשלחה הודעת וואטסאפ אל: </span>
          {names(sent)}
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
