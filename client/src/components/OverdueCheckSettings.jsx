import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// The overdue check's hour and "בדוק עכשיו" (server/src/services/overdueCheck.js). Business admins
// (and the shared Monday login, standing in for them) change them; others see the hour only.
export default function OverdueCheckSettings() {
  const { user } = useAppContext();
  const canEdit = user?.role === 'admin' || !!user?.is_super_admin || !!user?.is_embed;
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.getOverdueCheck().then(setSettings).catch(console.error);
  }, []);

  async function changeHour(hour) {
    setMessage('');
    try {
      setSettings(await api.setOverdueCheckHour(hour));
      setMessage('נשמר');
    } catch (err) {
      setMessage(err.message?.startsWith('API error') ? 'שגיאה בשמירה' : err.message || 'שגיאה בשמירה');
    }
  }

  async function runNow() {
    setRunning(true);
    setMessage('');
    setResult(null);
    try {
      const r = await api.runOverdueCheck();
      setSettings({ hour: r.hour, last_checked_on: r.last_checked_on });
      setResult(r);
    } catch (err) {
      setMessage(err.message?.startsWith('API error') ? 'הבדיקה נכשלה' : err.message || 'הבדיקה נכשלה');
    } finally {
      setRunning(false);
    }
  }

  if (!settings) return null;
  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">שעת הבדיקה היומית של משימות באיחור:</span>
        {canEdit ? (
          <select
            className="border rounded p-1 bg-white"
            value={settings.hour}
            onChange={(e) => changeHour(Number(e.target.value))}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        ) : (
          <span>{hourLabel(settings.hour)}</span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="px-3 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          >
            {running ? 'בודק…' : 'בדוק עכשיו'}
          </button>
        )}
        {message && <span className="text-gray-600">{message}</span>}
      </div>
      <p className="text-xs text-gray-500">
        שעון ישראל. ההודעה יכולה לצאת עד שעה אחרי השעה שנבחרה. "בדוק עכשיו" מריץ את הבדיקה מיד — מי שכבר קיבל היום
        תזכורת על אותה משימה לא יקבל שוב.
        {settings.last_checked_on && ` נבדק לאחרונה: ${settings.last_checked_on.split('-').reverse().join('/')}.`}
      </p>
      {result && (
        <div className="text-sm">
          <p>
            {result.checked
              ? `נמצאו ${result.checked} משימות באיחור. נשלחו ${result.whatsappMessages.filter((m) => m.sent).length} הודעות` +
                (result.alreadySent ? `, ${result.alreadySent} כבר קיבלו היום.` : '.')
              : 'אין משימות באיחור.'}
          </p>
          {result.whatsappMessages.length > 0 && (
            <ul className="list-disc pr-5 text-gray-700">
              {result.whatsappMessages.map((m, i) => (
                <li key={i}>
                  {m.recipientName} — "{m.taskTitle}" — {m.sent ? 'נשלחה' : 'נכשלה (הסיבה ביומן הודעות וואטסאפ)'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
