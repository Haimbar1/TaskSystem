import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import CloseSettingsButton from '../components/CloseSettingsButton.jsx';
import { explainMetaError } from '../metaErrors.js';

// The business's outgoing WhatsApp messages and what became of each (server/src/services/whatsappLog.js).
// "התקבלה ב-Meta" is all that's known at send time; sent/delivered/read/failed come later from
// Meta's status webhook (server/src/routes/whatsappWebhookRoutes.js).
const STATUS = {
  skipped: { label: 'לא נשלחה', className: 'bg-gray-100 text-gray-700' },
  accepted: { label: 'התקבלה ב-Meta', className: 'bg-amber-100 text-amber-800' },
  sent: { label: 'נשלחה', className: 'bg-sky-100 text-sky-800' },
  delivered: { label: 'נמסרה', className: 'bg-emerald-100 text-emerald-800' },
  read: { label: 'נקראה', className: 'bg-emerald-600 text-white' },
  failed: { label: 'נכשלה', className: 'bg-red-100 text-red-700' },
};

const EVENT = {
  assigned: 'הועברה לטיפול',
  status_changed: 'עדכון משימה',
  field_changed: 'עדכון משימה',
  overdue_reminder: 'משימה באיחור',
};

function formatTime(value) {
  return new Date(value).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// What a failed message's Meta error means and what to do about it (metaErrors.js).
function ErrorHelp({ why }) {
  return (
    <div className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm">
      <div className="font-semibold text-red-800 mb-1">
        למה ההודעה נכשלה? {why.title} <span className="font-normal text-red-600">(קוד {why.code})</span>
      </div>
      <p className="text-gray-700">{why.explain}</p>
      {why.causes && (
        <ul className="list-disc pr-5 mt-1 space-y-0.5 text-gray-700">
          {why.causes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {why.fix && (
        <>
          <div className="font-semibold text-gray-800 mt-2">מה לעשות:</div>
          <ol className="list-decimal pr-5 mt-1 space-y-0.5 text-gray-700">
            {why.fix.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export default function WhatsAppLogView() {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [search, setSearch] = useState('');
  // Typing fires a load per pause; only the latest one's answer is shown.
  const lastLoad = useRef(0);

  function load() {
    const id = ++lastLoad.current;
    setError('');
    api
      .getWhatsAppLog(search)
      .then((rows) => id === lastLoad.current && setMessages(rows))
      .catch((err) => {
        if (id !== lastLoad.current) return;
        console.error(err);
        setError('לא ניתן לטעון את היומן');
      });
  }

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-semibold">יומן הודעות וואטסאפ</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg border text-sm text-gray-600 hover:bg-gray-100"
          >
            רענון
          </button>
          <CloseSettingsButton />
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-3">
        200 ההודעות האחרונות של העסק (בחיפוש: 200 האחרונות שמתאימות). "התקבלה ב-Meta" אומר ש-Meta קיבלה את הבקשה לשליחה; האם ההודעה באמת הגיעה לטלפון
        (נשלחה / נמסרה / נקראה / נכשלה) מתעדכן כאן כש-Meta מדווחת על כך. לחיצה על שורה מציגה את נוסח ההודעה, ובהודעה שנכשלה גם הסבר מה לא בסדר ומה לעשות.
      </p>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי נמען, טלפון, משימה, נוסח ההודעה או שגיאה"
        className="w-full mb-3 px-3 py-2 rounded-lg border text-sm"
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!messages && !error && <p className="text-gray-500 text-sm">טוען…</p>}
      {messages?.length === 0 && (
        <p className="text-gray-500 text-sm">{search.trim() ? 'לא נמצאו הודעות מתאימות.' : 'עדיין לא נשלחו הודעות.'}</p>
      )}

      {messages?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-500 border-b">
                <th className="py-2 px-2 font-medium">זמן</th>
                <th className="py-2 px-2 font-medium">נמען</th>
                <th className="py-2 px-2 font-medium">משימה</th>
                <th className="py-2 px-2 font-medium">סוג</th>
                <th className="py-2 px-2 font-medium">מצב</th>
                <th className="py-2 px-2 font-medium">פירוט</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const status = STATUS[m.status] || { label: m.status, className: 'bg-gray-100 text-gray-700' };
                const open = openId === m.id;
                const why = m.error ? explainMetaError(m.error) : null;
                return (
                  <Fragment key={m.id}>
                    <tr
                      onClick={() => setOpenId(open ? null : m.id)}
                      className="border-b last:border-0 hover:bg-gray-50 cursor-pointer align-top"
                    >
                      <td className="py-2 px-2 whitespace-nowrap text-gray-600">{formatTime(m.created_at)}</td>
                      <td className="py-2 px-2">
                        <div>{m.recipient_name || '—'}</div>
                        {m.to_number && (
                          <div className="text-xs text-gray-400" dir="ltr">
                            +{m.to_number}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">{m.task_title || '—'}</td>
                      <td className="py-2 px-2 whitespace-nowrap">{EVENT[m.event_type] || m.event_type}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                        {m.updated_at !== m.created_at && m.status !== 'accepted' && (
                          <div className="text-xs text-gray-400 mt-0.5">{formatTime(m.updated_at)}</div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {why?.title && <div className="font-medium text-red-700">{why.title}</div>}
                        <div className="text-red-600" dir="auto">
                          {m.error}
                        </div>
                        {why?.title && !open && <div className="text-gray-400 mt-0.5">לחצו להסבר ומה לעשות</div>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b bg-gray-50">
                        <td colSpan={6} className="py-2 px-3">
                          {why?.title && <ErrorHelp why={why} />}
                          <div className="text-xs text-gray-500 mb-1">תבנית: {m.template_name}</div>
                          <pre className="whitespace-pre-wrap font-sans text-sm">{m.text || '—'}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
