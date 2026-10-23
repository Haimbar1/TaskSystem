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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .getWhatsAppTemplates()
      .then((d) => {
        setData(d);
        setDraft(Object.fromEntries(d.events.map((e) => [e.key, d.settings[e.key] || d.defaults[e.key]])));
      })
      .catch((err) => setMessage(err.message || 'שגיאה בטעינת התבניות'));
  }, []);

  if (!data) return message ? <p className="text-sm text-red-600 mt-5">{message}</p> : null;

  function chooseTemplate(eventKey, value) {
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
        {data.approved_error && (
          <p className="text-amber-700 mt-1">
            לא הצלחנו לקרוא את התבניות מ-Meta: {data.approved_error}. אפשר להשאיר את ברירת המחדל.
          </p>
        )}
      </div>

      {data.events.map((e) => {
        const t = draft[e.key];
        const def = data.defaults[e.key];
        const isDefault = sameTemplate(t, def);
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
                  onClick={() => setDraft({ ...draft, [e.key]: def })}
                  className="text-xs text-gray-500 hover:underline"
                >
                  חזרה לברירת המחדל
                </button>
              )}
            </div>
            <select
              dir="ltr"
              className="border rounded p-2 w-full bg-white"
              value={`${t.name}|${t.language}`}
              onChange={(ev) => chooseTemplate(e.key, ev.target.value)}
            >
              {!data.approved.some((a) => a.name === def.name && a.language === def.language) && (
                <option value={`${def.name}|${def.language}`}>{def.name} (ברירת המחדל)</option>
              )}
              {!inApproved && !(t.name === def.name && t.language === def.language) && (
                <option value={`${t.name}|${t.language}`}>{t.name} (לא נמצאה ב-WABA)</option>
              )}
              {data.approved.map((a) => (
                <option key={`${a.name}|${a.language}`} value={`${a.name}|${a.language}`}>
                  {a.name} · {a.language}
                  {a.name === def.name ? ' (ברירת המחדל)' : ''}
                </option>
              ))}
            </select>
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
            <p className="whitespace-pre-line text-gray-600 bg-gray-50 border rounded p-2">{preview}</p>
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
