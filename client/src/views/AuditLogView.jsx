import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CloseSettingsButton from '../components/CloseSettingsButton.jsx';

// Who did what in the business (server/src/services/auditLog.js), newest first.
const ACTION = {
  task_created: 'משימה נוצרה',
  task_updated: 'משימה עודכנה',
  task_deleted: 'משימה נמחקה',
  note_added: 'הערה נוספה',
  statuses_changed: 'סטטוסים עודכנו',
  settings_changed: 'הגדרות עודכנו',
  user_added: 'משתמש נוסף',
  user_updated: 'משתמש עודכן',
  user_deleted: 'משתמש נמחק',
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

export default function AuditLogView() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  function load() {
    setError('');
    api
      .getAuditLog()
      .then(setRows)
      .catch((err) => {
        console.error(err);
        setError('לא ניתן לטעון את היומן');
      });
  }

  useEffect(load, []);

  const q = filter.trim();
  const shown = (rows || []).filter(
    (r) => !q || [r.actor_name, r.task_title, r.details, ACTION[r.action]].some((v) => v?.includes(q))
  );

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-semibold">יומן פעולות</h2>
        <div className="flex gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="חיפוש (שם, משימה…)"
            className="border rounded-lg px-2 py-1.5 text-sm w-44"
          />
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
        300 הפעולות האחרונות בעסק: מי יצר, שינה או מחק משימות, ושינויים בהגדרות ובמשתמשים. בכניסה דרך Monday כולם
        משתמשים באותה כניסה, ולכן נרשם מי שנבחר ב"מי את/ה?" בראש המסך — לפי הבחירה במכשיר, לא זיהוי מאומת.
      </p>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!rows && !error && <p className="text-gray-500 text-sm">טוען…</p>}
      {rows?.length === 0 && <p className="text-gray-500 text-sm">עדיין אין פעולות ביומן.</p>}

      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-500 border-b">
                <th className="py-2 px-2 font-medium">זמן</th>
                <th className="py-2 px-2 font-medium">מי</th>
                <th className="py-2 px-2 font-medium">פעולה</th>
                <th className="py-2 px-2 font-medium">משימה</th>
                <th className="py-2 px-2 font-medium">פירוט</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="py-2 px-2 whitespace-nowrap text-gray-600">{formatTime(r.created_at)}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {r.actor_name || (r.via_monday ? 'לא נבחר' : '—')}
                    {r.via_monday && (
                      <span className="mr-1.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-xs">דרך Monday</span>
                    )}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">{ACTION[r.action] || r.action}</td>
                  <td className="py-2 px-2">{r.task_title || ''}</td>
                  <td className="py-2 px-2 text-gray-700">{r.details || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
