import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The current business's embed URL (for embedding the app in Monday etc.; see server/src/embed.js).
// Anyone with the URL gets in as the business's shared login, so it can be replaced or turned off.
export default function EmbedSettingsView() {
  const [token, setToken] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .getEmbedToken()
      .then((r) => setToken(r.token))
      .catch((err) => {
        setMessage('שגיאה בטעינה');
        console.error(err);
      })
      .finally(() => setLoaded(true));
  }, []);

  const url = token ? `${window.location.origin}/?embed_token=${encodeURIComponent(token)}` : '';

  async function run(action, confirmText, doneText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await action();
      setToken(r.token);
      setMessage(doneText);
    } catch (err) {
      setMessage('שגיאה בשמירה');
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('הקישור הועתק');
    } catch {
      setMessage('לא ניתן להעתיק אוטומטית, יש לסמן ולהעתיק ידנית');
    }
  }

  const rotateConfirm = 'ליצור קישור חדש? הקישור הקיים יפסיק לעבוד מיד, וצריך יהיה לעדכן אותו ב-Monday.';
  const clearConfirm = 'לבטל את הקישור? כניסה דרך Monday תפסיק לעבוד.';

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 max-w-2xl">
      <h2 className="font-semibold mb-3">הטמעה ב-Monday</h2>
      <p className="text-gray-500 text-sm mb-3">
        קישור לעסק הנוכחי שאפשר להטמיע ב-Monday. מי שפותח אותו נכנס בלי התחברות, וביצירת משימה
        חדשה בוחר מי יוצר אותה. כל מי שיש לו את הקישור יכול להיכנס, לכן כדאי לשתף אותו רק במקום
        ההטמעה.
      </p>

      {!loaded ? (
        <p className="text-sm text-gray-400">טוען…</p>
      ) : token ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              dir="ltr"
              value={url}
              onFocus={(e) => e.target.select()}
              className="border rounded p-2 w-full text-xs font-mono bg-gray-50"
            />
            <button onClick={copy} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shrink-0">
              העתק
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => run(api.rotateEmbedToken, rotateConfirm, 'נוצר קישור חדש')}
              disabled={busy}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-50"
            >
              צור קישור חדש
            </button>
            <button
              onClick={() => run(api.clearEmbedToken, clearConfirm, 'הקישור בוטל')}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-red-600 text-red-600 text-sm disabled:opacity-50"
            >
              בטל קישור
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => run(api.rotateEmbedToken, null, 'הקישור נוצר')}
          disabled={busy}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
        >
          {busy ? 'יוצר…' : 'צור קישור הטמעה'}
        </button>
      )}

      {message && <p className="text-sm text-gray-600 mt-3">{message}</p>}
    </div>
  );
}
