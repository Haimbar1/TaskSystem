import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Which Meta template each message goes out on, and what fills each {{n}} in it
// (server/src/services/whatsappTemplates.js). Super admin only, inside the WhatsApp settings.
// Only messages that differ from the default are saved, so a message left alone keeps following
// the default.
const sameTemplate = (a, b) =>
  a.name === b.name && a.language === b.language && a.body === b.body && a.params.join() === b.params.join();

function variableCount(body) {
  let max = 0;
  for (const m of String(body || '').matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export default function WhatsAppTemplatesSettings() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  // messages whose template is typed in by name (not picked from what Meta returned)
  const [custom, setCustom] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .getWhatsAppTemplates()
      .then((d) => {
        setData(d);
        setDraft(Object.fromEntries(d.events.map((e) => [e.key, d.settings[e.key] || d.defaults[e.key]])));
        // a saved template Meta didn't list (and not the default) was typed in — keep editing it that way
        setCustom(
          Object.fromEntries(
            d.events.map((e) => {
              const t = d.settings[e.key];
              const listed = t && d.approved.some((a) => a.name === t.name && a.language === t.language);
              return [e.key, Boolean(t && !listed && t.name !== d.defaults[e.key].name)];
            })
          )
        );
      })
      .catch((err) => setMessage(err.message || 'שגיאה בטעינת התבניות'));
  }, []);

  if (!data) return message ? <p className="text-sm text-red-600 mt-5">{message}</p> : null;

  // Typed-in template: its text (optional) sets the variables; without it, their number does.
  function editCustom(eventKey, patch) {
    const t = { ...draft[eventKey], ...patch };
    const count = t.body ? variableCount(t.body) : Math.min(10, Math.max(0, Number(patch.count ?? t.params.length) || 0));
    t.params = Array.from({ length: count }, (_, i) => t.params[i] || '');
    setDraft({ ...draft, [eventKey]: t });
  }

  function chooseTemplate(eventKey, value) {
    if (value === '__custom__') {
      setCustom({ ...custom, [eventKey]: true });
      setDraft({ ...draft, [eventKey]: { name: '', language: 'he', body: '', params: [] } });
      return;
    }
    setCustom({ ...custom, [eventKey]: false });
    const [name, language] = value.split('|');
    const t =
      data.approved.find((a) => a.name === name && a.language === language) ||
      (data.defaults[eventKey].name === name ? data.defaults[eventKey] : null);
    if (!t) return;
    const count = variableCount(t.body);
    const previous = draft[eventKey].params;
    // a default template keeps its own mapping; another one starts from what was chosen before
    const params = t.params || Array.from({ length: count }, (_, i) => previous[i] || '');
    setDraft({ ...draft, [eventKey]: { name: t.name, language: t.language, body: t.body, params } });
  }

  function chooseField(eventKey, index, field) {
    const params = [...draft[eventKey].params];
    params[index] = field;
    setDraft({ ...draft, [eventKey]: { ...draft[eventKey], params } });
  }

  async function save() {
    const unnamed = data.events.find((e) => !draft[e.key].name.trim());
    if (unnamed) {
      setMessage(`יש להזין שם תבנית ל"${unnamed.label}"`);
      return;
    }
    const missing = data.events.find((e) => draft[e.key].params.some((p) => !p));
    if (missing) {
      setMessage(`יש לבחור מה נכנס בכל משתנה בתבנית של "${missing.label}"`);
      return;
    }
    const settings = {};
    for (const e of data.events) {
      if (!sameTemplate(draft[e.key], data.defaults[e.key])) settings[e.key] = draft[e.key];
    }
    setSaving(true);
    setMessage('');
    try {
      await api.updateWhatsAppTemplates(settings);
      setMessage('נשמר בהצלחה');
    } catch (err) {
      setMessage(err.message?.startsWith('API error') ? 'שגיאה בשמירה' : err.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 border-t pt-4 text-sm space-y-4">
      <div>
        <h3 className="font-semibold">תבניות ההודעות</h3>
        <p className="text-gray-500">
          לכל הודעה שמערכת המשימות שולחת — באיזו תבנית מאושרת ב-Meta היא יוצאת, ומה נכנס בכל משתנה ({'{{1}}'},{' '}
          {'{{2}}'}…) של התבנית. לעסק הזה בלבד.
        </p>
        {data.templates_waba_id && (
          <p className="text-gray-500 mt-1">
            התבניות נטענות מ-WABA <span dir="ltr">{data.templates_waba_id}</span> — ה-WABA שהמספר השולח שייך אליו.
          </p>
        )}
        {data.waba_mismatch && (
          <p className="text-amber-700 mt-1">
            ה-WABA ID השמור בהגדרות (<span dir="ltr">{data.saved_waba_id}</span>) לא תואם למספר השולח. כדאי לתקן אותו
            ל-<span dir="ltr">{data.templates_waba_id}</span> ולשמור.
          </p>
        )}
        {(() => {
          // e.g. after switching the WABA: a chosen template the new WABA doesn't have will fail to send
          if (!data.approved.length) return null;
          const missing = data.events.filter((e) => {
            const t = draft[e.key];
            return t?.name && !data.approved.some((a) => a.name === t.name && a.language === t.language);
          });
          return missing.length ? (
            <p className="text-amber-700 mt-1">
              התבניות של {missing.map((e) => `"${e.label}"`).join(', ')} לא נמצאות ב-WABA הנוכחי — ההודעות האלה ייכשלו עד
              שתבחרו להן תבנית מהרשימה.
            </p>
          ) : null;
        })()}
        {data.approved_error && (
          <p className="text-amber-700 mt-1">
            לא הצלחנו לקרוא את התבניות מ-Meta: {data.approved_error}
          </p>
        )}
      </div>

      {data.events.map((e) => {
        const t = draft[e.key];
        const def = data.defaults[e.key];
        const isDefault = sameTemplate(t, def);
        const isCustom = custom[e.key];
        const inApproved = data.approved.some((a) => a.name === t.name && a.language === t.language);
        const preview = t.body.replace(/\{\{(\d+)\}\}/g, (m, n) => {
          const field = t.params[Number(n) - 1];
          return field ? `[${data.fields[field]}]` : m;
        });
        return (
          <div key={e.key} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{e.label}</span>
              {!isDefault && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, [e.key]: def });
                    setCustom({ ...custom, [e.key]: false });
                  }}
                  className="text-xs text-gray-500 hover:underline"
                >
                  חזרה לברירת המחדל
                </button>
              )}
            </div>
            <select
              dir="ltr"
              className="border rounded p-2 w-full bg-white"
              value={isCustom ? '__custom__' : `${t.name}|${t.language}`}
              onChange={(ev) => chooseTemplate(e.key, ev.target.value)}
            >
              {!data.approved.some((a) => a.name === def.name && a.language === def.language) && (
                <option value={`${def.name}|${def.language}`}>{def.name} (ברירת המחדל)</option>
              )}
              {!isCustom && !inApproved && !(t.name === def.name && t.language === def.language) && (
                <option value={`${t.name}|${t.language}`}>{t.name} (לא נמצאה ב-WABA)</option>
              )}
              {data.approved.map((a) => (
                <option key={`${a.name}|${a.language}`} value={`${a.name}|${a.language}`}>
                  {a.name} · {a.language}
                  {a.name === def.name ? ' (ברירת המחדל)' : ''}
                </option>
              ))}
              <option value="__custom__">✎ הקלדת שם תבנית…</option>
            </select>
            {isCustom && (
              <div className="space-y-2 border rounded p-2 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="sm:col-span-2">
                    <span className="block text-xs text-gray-500 mb-1">שם התבנית בדיוק כמו ב-Meta</span>
                    <input
                      dir="ltr"
                      className="border rounded p-1.5 w-full bg-white"
                      placeholder="my_template_name"
                      value={t.name}
                      onChange={(ev) => editCustom(e.key, { name: ev.target.value.trim() })}
                    />
                  </label>
                  <label>
                    <span className="block text-xs text-gray-500 mb-1">שפה</span>
                    <input
                      dir="ltr"
                      className="border rounded p-1.5 w-full bg-white"
                      placeholder="he"
                      value={t.language}
                      onChange={(ev) => editCustom(e.key, { language: ev.target.value.trim() })}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-1">
                    טקסט התבנית (לא חובה) — מדביקים כמו ב-Meta, עם {'{{1}}'}, {'{{2}}'}…; משמש לתצוגה וליומן ההודעות
                  </span>
                  <textarea
                    rows={3}
                    className="border rounded p-1.5 w-full bg-white"
                    value={t.body}
                    onChange={(ev) => editCustom(e.key, { body: ev.target.value })}
                  />
                </label>
                {!t.body && (
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">מספר משתנים בתבנית</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className="border rounded p-1.5 w-20 bg-white"
                      value={t.params.length}
                      onChange={(ev) => editCustom(e.key, { count: ev.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
            {t.params.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.params.map((field, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <span dir="ltr" className="text-gray-500 w-10 shrink-0">{`{{${i + 1}}}`}</span>
                    <select
                      className="border rounded p-1.5 w-full bg-white"
                      value={field}
                      onChange={(ev) => chooseField(e.key, i, ev.target.value)}
                    >
                      <option value="">בחרו…</option>
                      {Object.entries(data.fields).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            {preview && <p className="whitespace-pre-line text-gray-600 bg-gray-50 border rounded p-2">{preview}</p>}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'שמור תבניות'}
        </button>
        {message && <span className="text-gray-600">{message}</span>}
      </div>
    </div>
  );
}
