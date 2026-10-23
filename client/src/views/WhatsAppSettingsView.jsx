import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import CloseSettingsButton from '../components/CloseSettingsButton.jsx';
import WhatsAppTemplatesSettings from '../components/WhatsAppTemplatesSettings.jsx';

// Per-business WhatsApp Business credentials (see server/src/routes/tenantRoutes.js).
// The access token is write-only here — the server never sends it back in
// full, only whether one is set — so the field starts blank even when a
// token already exists, and is left untouched on save unless retyped.
// Only the platform owner (super admin) may change them; a business admin sees them read-only.
export default function WhatsAppSettingsView() {
  const { user } = useAppContext();
  const canEdit = !!user?.is_super_admin;
  const [tokenSet, setTokenSet] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [linked, setLinked] = useState(false);
  const [forwardUrl, setForwardUrl] = useState('');
  const [messageLink, setMessageLink] = useState('');
  const [defaultLink, setDefaultLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [sources, setSources] = useState([]);
  // bumped after the WABA / number changes, so the templates section reloads the new WABA's templates
  const [templatesKey, setTemplatesKey] = useState(0);
  const [sourceId, setSourceId] = useState('');
  const [taking, setTaking] = useState(false);
  const [takeMessage, setTakeMessage] = useState('');

  const [wabaNumbers, setWabaNumbers] = useState([]);
  const [phoneNotInWaba, setPhoneNotInWaba] = useState(false);

  function applySettings(s) {
    setWabaNumbers(s.waba_numbers || []);
    setPhoneNotInWaba(!!s.phone_not_in_waba);
    setTokenSet(s.whatsapp_access_token_set);
    setPhoneNumberId(s.whatsapp_phone_number_id);
    setWabaId(s.whatsapp_waba_id);
    setMessageLink(s.message_link_url || '');
  }

  // A number as people know it: "+972 50-123-4567 · Verified name", or its Phone Number ID when Meta
  // didn't say.
  function numberLabel(s) {
    if (!s.display_phone_number) return `Phone Number ID ${s.whatsapp_phone_number_id}`;
    return s.verified_name ? `${s.display_phone_number} · ${s.verified_name}` : s.display_phone_number;
  }

  // Super admin: move a WhatsApp number (with its WABA and token) into this business.
  async function handleTake() {
    const source = sources.find((s) => s.whatsapp_phone_number_id === sourceId);
    if (!source) return;
    const ok = window.confirm(
      `לעבור לשלוח מהמספר ${numberLabel(source)}?\n` +
        `(WABA ${source.whatsapp_waba_id || 'ללא מזהה'}` +
        `${source.account_name ? ` · ${source.account_name}` : ''}${source.tenant_name ? ` של "${source.tenant_name}"` : ''})\n` +
        'הטוקן, ה-WABA ID וה-Phone Number ID שלו יחליפו את הנוכחיים בעסק הזה.'
    );
    if (!ok) return;
    setTaking(true);
    setTakeMessage('');
    try {
      const s = await api.takeWhatsAppFrom(source);
      applySettings(s);
      setTemplatesKey((k) => k + 1);
      setAccessToken('');
      setSourceId('');
      setTakeMessage(
        !s.linked || s.vault?.ok
          ? `העסק שולח עכשיו מהמספר ${numberLabel(source)}`
          : 'הועבר כאן, אבל השמירה בפורטל נכשלה — נסו שוב או עדכנו בפורטל ב"מזהים וחיבורים"'
      );
    } catch (err) {
      setTakeMessage(err.message?.startsWith('API error') ? 'שגיאה בהעברה' : err.message || 'שגיאה בהעברה');
      console.error(err);
    } finally {
      setTaking(false);
    }
  }

  useEffect(() => {
    if (canEdit) api.getWhatsAppSources().then((r) => setSources(r.sources || [])).catch(console.error);
  }, [canEdit]);

  function load() {
    api.getWhatsAppSettings().then((s) => {
      applySettings(s);
      setLinked(!!s.linked);
      setForwardUrl(s.status_forward_url || '');
      setMessageLink(s.message_link_url || '');
      setDefaultLink(s.default_message_link || '');
    });
  }

  function copyForwardUrl() {
    navigator.clipboard?.writeText(forwardUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        message_link_url: messageLink,
      });
      applySettings(s);
      setTemplatesKey((k) => k + 1);
      setAccessToken('');
      setMessage(
        !s.linked || s.vault?.ok
          ? 'נשמר בהצלחה'
          : 'נשמר כאן, אבל השמירה בפורטל נכשלה — נסו שוב או עדכנו בפורטל ב"מזהים וחיבורים"'
      );
    } catch (err) {
      setMessage(err.message?.startsWith('API error') ? 'שגיאה בשמירה' : err.message || 'שגיאה בשמירה');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">הגדרות וואטסאפ לעסק</h2>
        <CloseSettingsButton />
      </div>
      {canEdit ? (
        <p className="text-gray-500 text-sm mb-3">
          המזהים האלה שייכים לעסק הנוכחי בלבד.
          {linked &&
            ' הם נשמרים בפורטל ("מזהים וחיבורים") ומשותפים למערכת ההודעות ולבוט APP — מספיק להזין אותם באחד המקומות.'}
        </p>
      ) : (
        <div className="text-sm mb-3 space-y-1">
          <p className={tokenSet && phoneNumberId ? 'text-emerald-700 font-medium' : 'text-gray-600 font-medium'}>
            {tokenSet && phoneNumberId
              ? 'וואטסאפ מחובר — עדכוני המשימות נשלחים בוואטסאפ.'
              : 'וואטסאפ עדיין לא מחובר לעסק — לא נשלחות הודעות.'}
          </p>
          <p className="text-gray-500">שינוי ההגדרות נעשה על ידי מנהל המערכת בלבד.</p>
        </div>
      )}
      {canEdit && sources.length > 0 && (
        <div className="mb-4 border rounded-lg p-3 bg-gray-50 space-y-2">
          <h3 className="font-semibold text-sm">החלפת מספר וואטסאפ (WABA)</h3>
          <p className="text-xs text-gray-500">
            כל המספרים בחשבונות ה-WABA של העסקים שלך. בחרו מספר — ה-WABA והטוקן שלו עוברים איתו לעסק הזה, והעסק
            שממנו הוא הגיע ממשיך לשלוח ממנו.
          </p>
          <div className="flex gap-2">
            <select
              className="border rounded p-2 w-full bg-white text-sm"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">בחרו מספר…</option>
              {sources.map((s) => {
                const current = s.whatsapp_phone_number_id === phoneNumberId;
                return (
                  <option key={s.whatsapp_phone_number_id} value={s.whatsapp_phone_number_id} disabled={current}>
                    {numberLabel(s)} — {[s.account_name, s.tenant_name].filter(Boolean).join(' · ')}
                    {current ? ' (המספר הנוכחי)' : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={handleTake}
              disabled={!sourceId || taking}
              className="px-3 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50 whitespace-nowrap"
            >
              {taking ? 'מעביר…' : 'העבר לכאן'}
            </button>
          </div>
          {takeMessage && <p className="text-sm text-gray-600">{takeMessage}</p>}
        </div>
      )}
      {canEdit && (
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
          {phoneNotInWaba && (
            <div className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
              <p>ה-Phone Number ID השמור לא שייך ל-WABA הזה. המספרים של ה-WABA לפי Meta:</p>
              {wabaNumbers.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setPhoneNumberId(n.id)}
                  className="block text-right underline hover:no-underline"
                >
                  {n.display_phone_number || n.id} <span dir="ltr">({n.id})</span> — השתמש במספר הזה
                </button>
              ))}
              <p className="text-xs">אחרי הבחירה לוחצים "שמור".</p>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm mb-1">קישור למשימה בהודעות</label>
          <input
            dir="ltr"
            placeholder={defaultLink}
            className="border rounded p-2 w-full"
            value={messageLink}
            onChange={(e) => setMessageLink(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            לעסק הזה בלבד. הקישור בהודעה פותח את המשימה עצמה בכתובת הזו. עסק שעובד מתוך Monday — הכתובת של הלוח
            שבו האפליקציה מוטמעת (למשל https://xxx.monday.com/boards/…); מי שלא מחובר ל-Monday יתבקש להתחבר. ריק =
            מערכת המשימות.
          </p>
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
      )}

      {canEdit && <WhatsAppTemplatesSettings key={templatesKey} />}

      {/* Where n8n forwards Meta's delivery statuses (server/src/routes/whatsappWebhookRoutes.js). */}
      {canEdit && forwardUrl && (
        <div className="mt-5 border-t pt-4 text-sm space-y-2">
          <h3 className="font-semibold">סטטוס מסירה ביומן ההודעות</h3>
          <p className="text-gray-500">
            ה-Webhook של Meta כבר מחובר ל-n8n (בהגדרות הוואטסאפ של מערכת ההודעות) — לא משנים אותו. כדי שביומן יופיע אם
            הודעה נמסרה, נקראה או נכשלה, ה-workflow ב-n8n שמקבל את ה-Webhook מעביר את אותו גוף בקשה (POST, JSON) גם לכתובת
            הזו. כתובת אחת לכל העסקים.
          </p>
          <div className="flex gap-2">
            <input readOnly dir="ltr" value={forwardUrl} className="border rounded p-2 w-full bg-gray-50 text-xs" />
            <button
              type="button"
              onClick={copyForwardUrl}
              className="px-3 rounded-lg border text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap"
            >
              {copied ? 'הועתק' : 'העתק'}
            </button>
          </div>
        </div>
      )}

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
          מי שביצע את השינוי לא מקבל הודעה על עצמו, והודעות נשלחות רק לאנשי העסק עצמו (לא למנהל המערכת כשהוא עובד
          בתוך העסק) ורק למשתמשים שיש להם מספר טלפון. אחרי שמירת משימה
          מופיעה הודעה קצרה בפינת המסך: למי נשלח וואטסאפ, ולמי השליחה נכשלה. כל ההודעות היוצאות ומה עלה בגורלן (נמסרה,
          נקראה, נכשלה ולמה) מופיעות ב"יומן הודעות וואטסאפ" שבתפריט ההגדרות.
        </p>
      </div>
    </div>
  );
}
