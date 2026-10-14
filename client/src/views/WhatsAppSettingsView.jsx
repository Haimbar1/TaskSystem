import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Per-business WhatsApp Business credentials (see server/src/routes/tenantRoutes.js).
// The access token is write-only here — the server never sends it back in
// full, only whether one is set — so the field starts blank even when a
// token already exists, and is left untouched on save unless retyped.
export default function WhatsAppSettingsView() {
  const [tokenSet, setTokenSet] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [linked, setLinked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    api.getWhatsAppSettings().then((s) => {
      setTokenSet(s.whatsapp_access_token_set);
      setPhoneNumberId(s.whatsapp_phone_number_id);
      setWabaId(s.whatsapp_waba_id);
      setLinked(!!s.linked);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const s = await api.updateWhatsAppSettings({
        whatsapp_access_token: accessToken,
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_waba_id: wabaId,
      });
      setTokenSet(s.whatsapp_access_token_set);
      setPhoneNumberId(s.whatsapp_phone_number_id);
      setWabaId(s.whatsapp_waba_id);
      setAccessToken('');
      setMessage(
        !s.linked || s.vault?.ok
          ? 'נשמר בהצלחה'
          : 'נשמר כאן, אבל השמירה בפורטל נכשלה — נסו שוב או עדכנו בפורטל ב"מזהים וחיבורים"'
      );
    } catch (err) {
      setMessage('שגיאה בשמירה');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 max-w-lg">
      <h2 className="font-semibold mb-3">הגדרות וואטסאפ לעסק</h2>
      <p className="text-gray-500 text-sm mb-3">
        המזהים האלה שייכים לעסק הנוכחי בלבד.
        {linked &&
          ' הם נשמרים בפורטל ("מזהים וחיבורים") ומשותפים למערכת ההודעות ולבוט APP — מספיק להזין אותם באחד המקומות.'}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">
            Access Token {tokenSet && <span className="text-green-600">(מוגדר)</span>}
          </label>
          <input
            type="password"
            placeholder={tokenSet ? '••••••••  (השאירי ריק כדי לא לשנות)' : ''}
            className="border rounded p-2 w-full"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Phone Number ID</label>
          <input
            className="border rounded p-2 w-full"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">WABA ID</label>
          <input
            className="border rounded p-2 w-full"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-500 border rounded p-2 bg-gray-50">
          כשה-Access Token וה-Phone Number ID מוגדרים, עדכוני המשימות נשלחים בוואטסאפ מהמספר של העסק (בתבניות
          המאושרות ב-Meta).
        </p>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'שמור'}
        </button>
        {message && <span className="text-sm text-gray-600 mr-3">{message}</span>}
      </form>

      {/* Mirrors server/src/services/notifications.js and routes/cronRoutes.js — keep in sync. */}
      <div className="mt-5 border-t pt-4 text-sm space-y-2">
        <h3 className="font-semibold">מתי ולמי נשלחות הודעות</h3>
        <ul className="list-disc pr-5 space-y-1 text-gray-700">
          <li>
            <span className="font-medium">משימה חדשה</span> — לאחראים על המשימה (תבנית "הועברה לטיפולך").
          </li>
          <li>
            <span className="font-medium">שינוי אחראים</span> — לכל המעורבים במשימה: מי שפתח אותה והאחראים עליה (תבנית
            "הועברה לטיפולך").
          </li>
          <li>
            <span className="font-medium">עדכון משימה</span> (סטטוס, עדיפות, כותרת, תיאור או תאריך יעד) — לכל המעורבים
            במשימה, עם פירוט מה השתנה ומי שינה (תבנית "המשימה עודכנה").
          </li>
          <li>
            <span className="font-medium">משימה באיחור</span> — בבדיקה האוטומטית, לאחראים על כל משימה שתאריך היעד שלה עבר
            והיא לא במצב "בוצע" או "מושהה".
          </li>
        </ul>
        <p className="text-gray-500">
          מי שביצע את השינוי לא מקבל הודעה על עצמו, והודעות נשלחות רק למשתמשים שיש להם מספר טלפון. אחרי שמירת משימה
          מופיעה הודעה קצרה בפינת המסך: למי נשלח וואטסאפ, ולמי השליחה נכשלה.
        </p>
      </div>
    </div>
  );
}
