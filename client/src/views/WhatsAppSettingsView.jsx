import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import CloseSettingsButton from '../components/CloseSettingsButton.jsx';
import WhatsAppTemplatesSettings from '../components/WhatsAppTemplatesSettings.jsx';
import OverdueCheckSettings from '../components/OverdueCheckSettings.jsx';

// Where a value the business sends with comes from (server/src/tenantSecrets.js): the server's
// environment wins for the original business, then the portal vault, then this app's own row — so a
// token and a WABA ID can come from different places, and not match.
const SOURCE_LABELS = { env: 'מהגדרות השרת (Vercel)', vault: 'מהפורטל', local: 'ממערכת המשימות' };
function SourceNote({ source }) {
  if (!SOURCE_LABELS[source]) return null;
  return <span className="text-xs text-gray-400 mr-1">· {SOURCE_LABELS[source]}</span>;
}

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
  const [portalUrl, setPortalUrl] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [numberName, setNumberName] = useState('');
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
  const [phoneWabaId, setPhoneWabaId] = useState('');

  const [valueSources, setValueSources] = useState({});

  function applySettings(s) {
    setValueSources(s.sources || {});
    setWabaNumbers(s.waba_numbers || []);
    setPhoneNotInWaba(!!s.phone_not_in_waba);
    setPhoneWabaId(s.phone_waba_id || '');
    setTokenSet(s.whatsapp_access_token_set);
    setPhoneNumberId(s.whatsapp_phone_number_id);
    setWabaId(s.whatsapp_waba_id);
    setMessageLink(s.message_link_url || '');
    setLinked(!!s.linked);
    setPortalUrl(s.portal_secrets_url || '');
    setDisplayPhone(s.display_phone_number || '');
    setNumberName(s.number_name || '');
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
        'מערכת המשימות תשלח מהמספר הזה.'
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
      // a business linked to the portal saves only the message link here, and one that isn't keeps
      // its WhatsApp here — nothing from this form goes to the portal any more
      setMessage('נשמר בהצלחה');
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
            המספרים של העסק הזה ושל עסק חכם. בחרו מספר ולחצו "העבר לכאן" — מערכת המשימות תשלח ממנו. מספר של עסק חכם
            נשלח עם הטוקן של עסק חכם, והוואטסאפ של העסק הזה עצמו לא משתנה.
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
      {canEdit && linked && (
        <div className="mb-3 border rounded-lg p-3 bg-blue-50 text-sm space-y-1">
          <p className="text-xs text-blue-900">מערכת המשימות שולחת מהמספר:</p>
          <p className="text-lg font-semibold text-gray-900">
            {displayPhone ? <bdi dir="ltr">{displayPhone}</bdi> : phoneNumberId ? 'מספר לא מזוהה' : 'לא מוגדר מספר'}
            {numberName && <span className="font-normal text-gray-700"> · {numberName}</span>}
          </p>
          <p className="text-xs text-gray-400">
            Phone Number ID <span dir="ltr">{phoneNumberId || '—'}</span> · WABA <span dir="ltr">{wabaId || '—'}</span> ·
            טוקן {tokenSet ? 'מוגדר' : 'לא מוגדר'}
          </p>
          <p className="text-gray-600">
            הטוקן, והבחירה אם מערכת המשימות שולחת מהמספר של העסק או של עסק חכם — בפורטל, ב"מזהים וחיבורים" ← "חיבור
            מהיר".
          </p>
          {portalUrl && (
            <a href={portalUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
              שינוי בפורטל
            </a>
          )}
        </div>
      )}
      {canEdit && (
      <form onSubmit={handleSubmit} className="space-y-3">
        {!linked && (<>
        <div>
          <label className="block text-sm mb-1">
            Access Token {tokenSet && <span className="text-green-600">(מוגדר)</span>}
            <SourceNote source={valueSources.whatsapp_access_token} />
          </label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={tokenSet ? '••••••••  (השאירי ריק כדי לא לשנות)' : ''}
            className="border rounded p-2 w-full"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">
            Phone Number ID <SourceNote source={valueSources.whatsapp_phone_number_id} />
          </label>
          <input
            className="border rounded p-2 w-full"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">
            WABA ID <SourceNote source={valueSources.whatsapp_waba_id} />
          </label>
          <input
            className="border rounded p-2 w-full"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
          />
          {phoneNotInWaba && (
            <div className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
              <p>ה-Phone Number ID השמור לא שייך ל-WABA הזה.</p>
              {phoneWabaId && (
                <button
                  type="button"
                  onClick={() => setWabaId(phoneWabaId)}
                  className="block text-right underline hover:no-underline"
                >
                  לפי Meta המספר שייך ל-WABA <span dir="ltr">{phoneWabaId}</span> — השתמש ב-WABA הזה
                </button>
              )}
              <p>או לבחור מספר אחר מה-WABA השמור (לפי Meta):</p>
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
        </>)}
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
            <span className="font-medium">רק אחרי שיש אחראי</span> — כל עוד למשימה אין אחראים, לא נשלחת עליה שום הודעה.
          </li>
          <li>
            <span className="font-medium">משימה חדשה / הוספת אחראי</span> — רק למי שקיבל עכשיו את המשימה (לא לאחראים שכבר
            היו ולא למי שפתח אותה; תבנית "הועברה לטיפולך").
          </li>
          <li>
            <span className="font-medium">שינוי סטטוס</span> — לאחראים ולמי שפתח את המשימה, עם פירוט מה השתנה ומי שינה
            (תבנית "המשימה עודכנה").
          </li>
          <li>
            <span className="font-medium">עדכון טקסט התיאור</span> (כולל סימון שורה בתיאור כ"בוצע") — רק לאחראים על
            המשימה (תבנית "המשימה עודכנה").
          </li>
          <li>
            <span className="font-medium">שינוי כותרת, עדיפות או תאריך יעד</span> — לא נשלחת הודעה (השינוי נרשם ב"יומן
            פעולות").
          </li>
          <li>
            <span className="font-medium">משימה באיחור</span> — בבדיקה האוטומטית, פעם ביום בשעה שנבחרה למטה: לאחראים על כל
            משימה שתאריך היעד שלה עבר (מהבוקר שאחרי תאריך היעד) והיא לא בסטטוס סיום או "מושהה". כל יום עד שהמשימה
            מסתיימת; לא למי שפתח את המשימה.
          </li>
        </ul>
        <OverdueCheckSettings />
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
