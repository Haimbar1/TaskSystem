import { pool } from '../db.js';
import { PRIORITY_LABELS } from '../labels.js';

// Which Meta template each message the task system sends goes out on, and what fills each of its
// {{n}} variables. Every business starts on the three templates Haim has approved (DEFAULT_TEMPLATES,
// copied verbatim from the WhatsApp Business template library so the logged text matches what is
// really sent); the platform owner can point any message at another approved template of the
// business's WABA on the "הגדרות וואטסאפ" screen (tenants.whatsapp_templates).

// The messages, in the order the settings screen shows them (eventType as passed to whatsapp.js).
// when: when it goes out and to whom, shown under the label (only users with a phone get any).
// Mirrors recipientsFor in notifications.js — keep in sync.
export const TEMPLATE_EVENTS = [
  {
    key: 'assigned',
    label: 'משימה חדשה / שינוי אחראים',
    when:
      'בשמירה עם "שלח עדכון בוואטסאפ" מסומן, אחרי ששייכו אחראי —ביצירת משימה עם אחראים, או כשמוסיפים אחראי למשימה קיימת. רק למי שקיבל עכשיו את המשימה ' +
      '(לא לאחראים שכבר היו, לא למי שפתח אותה ולא למי שביצע את השינוי). משימה בלי אחראים לא שולחת שום הודעה.',
  },
  {
    key: 'status_changed',
    label: 'שינוי סטטוס',
    when:
      'בשמירה עם "שלח עדכון בוואטסאפ" מסומן, אחרי שהסטטוס השתנה,אם יש למשימה אחראים — לאחראים ולמי שפתח את המשימה ' +
      '(לא למי שביצע את השינוי). ההודעה מפרטת את כל השינויים מאז העדכון הקודם.',
  },
  {
    key: 'field_changed',
    label: 'עדכון תיאור המשימה',
    when:
      'בשמירה עם "שלח עדכון בוואטסאפ" מסומן, אחרי שטקסט התיאור השתנה(כולל סימון שורה כ"בוצע") — רק לאחראים על המשימה ' +
      '(לא למי שביצע את השינוי). שינוי כותרת, עדיפות או תאריך יעד לבדו לא שולח הודעה.',
  },
  {
    key: 'overdue_reminder',
    label: 'משימה באיחור',
    when:
      'בדיקה אוטומטית פעם ביום, בשעה שנבחרה ב"מתי ולמי נשלחות הודעות" (ברירת מחדל 08:00): משימה שתאריך היעד שלה עבר — כלומר מהבוקר ' +
      'שאחרי תאריך היעד — ושאינה בסטטוס סיום או "מושהה". נשלחת לאחראים על המשימה, פעם ביום, כל יום עד שהיא מסתיימת.',
  },
];

// What a variable can be filled with. ctx: { recipientName, task, dueDate, statusLabel, link,
// changedByName, changeSummary } (changedByName / changeSummary are empty for the overdue check).
export const TEMPLATE_FIELDS = {
  recipient_name: { label: 'שם הנמען', value: (c) => c.recipientName },
  task_title: { label: 'כותרת המשימה', value: (c) => c.task.title },
  due_date: { label: 'תאריך יעד', value: (c) => c.dueDate },
  status: { label: 'סטטוס', value: (c) => c.statusLabel },
  priority: { label: 'עדיפות', value: (c) => PRIORITY_LABELS[c.task.priority] || c.task.priority || '' },
  description: { label: 'תיאור המשימה', value: (c) => c.task.description },
  changed_by: { label: 'מי עדכן', value: (c) => c.changedByName },
  change_summary: { label: 'מה השתנה', value: (c) => c.changeSummary },
  link: { label: 'קישור למשימה', value: (c) => c.link },
};

// { name, language, params: [field per {{n}}, in order], body: the template's text }
const TASK_UPDATED = {
  name: 'a_task_was_updated',
  language: 'he',
  params: ['recipient_name', 'task_title', 'changed_by', 'change_summary', 'link'],
  body: 'שלום {{1}},\nהמשימה *{{2}}*,\nעודכנה ע"י {{3}}.\nהעדכון {{4}}\nקישור למשימה:\n{{5}},\nלידיעתך',
};
export const DEFAULT_TEMPLATES = {
  assigned: {
    name: 'new_task_was_assigned_to_you_rev1',
    language: 'he',
    params: ['recipient_name', 'task_title', 'due_date', 'link'],
    body: 'שלום {{1}},\nהמשימה *{{2}}*, הועברה לטיפולך.\nתאריך יעד {{3}}.\nקישור למשימה:\n{{4}},\nלטיפולך המסור',
  },
  // a field update shares the status change's template — both are "the task was updated", with a
  // different summary of what changed
  status_changed: TASK_UPDATED,
  field_changed: TASK_UPDATED,
  overdue_reminder: {
    name: 'task_overdue',
    language: 'he',
    params: ['task_title', 'status', 'due_date', 'link'],
    body: 'שלום,\nהמשימה {{1}} עדיין במצב {{2}}\nתאריך היעד שלה הוא {{3}}\nקישור למשימה{{4}},\nלטיפולך',
  },
};

// How many {{n}} variables a template body has (the highest n).
export function variableCount(body) {
  let max = 0;
  for (const m of String(body || '').matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

let columnReady = false;
async function ensureColumn() {
  if (columnReady) return;
  await pool.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB');
  await pool.query('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_template_titles JSONB');
  columnReady = true;
}

// The Hebrew name the business gave each Meta template, for the settings screen only:
// { [template name]: title }.
export async function getTemplateTitles(tenantId) {
  await ensureColumn();
  const { rows } = await pool.query('SELECT whatsapp_template_titles FROM tenants WHERE id = $1', [tenantId]);
  const saved = rows[0]?.whatsapp_template_titles;
  return saved && typeof saved === 'object' ? saved : {};
}

export async function setTemplateTitles(tenantId, input) {
  const clean = {};
  for (const [name, title] of Object.entries(input && typeof input === 'object' ? input : {})) {
    const t = String(title || '').trim().slice(0, 80);
    if (/^[a-z0-9_]+$/.test(name) && t) clean[name] = t;
  }
  await ensureColumn();
  await pool.query('UPDATE tenants SET whatsapp_template_titles = $1 WHERE id = $2', [
    Object.keys(clean).length ? JSON.stringify(clean) : null,
    tenantId,
  ]);
}

// The business's own choices: { [eventType]: { name, language, params, body } } — only the
// messages it changed; the rest use DEFAULT_TEMPLATES.
export async function getTemplateSettings(tenantId) {
  await ensureColumn();
  const { rows } = await pool.query('SELECT whatsapp_templates FROM tenants WHERE id = $1', [tenantId]);
  const saved = rows[0]?.whatsapp_templates;
  return saved && typeof saved === 'object' ? saved : {};
}

// Saves the choices; a message set to null (or missing) goes back to its default. Returns an error
// message for anything malformed.
export async function setTemplateSettings(tenantId, input) {
  const clean = {};
  for (const { key, label } of TEMPLATE_EVENTS) {
    const t = input?.[key];
    if (!t) continue;
    const name = String(t.name || '').trim();
    const language = String(t.language || '').trim();
    const body = String(t.body || '');
    const params = Array.isArray(t.params) ? t.params.map(String) : [];
    if (!/^[a-z0-9_]+$/.test(name)) return `שם התבנית של "${label}" יכול להכיל רק אותיות לועזיות קטנות, ספרות ו-_`;
    if (!/^[A-Za-z_]{2,10}$/.test(language)) return `קוד השפה של "${label}" לא תקין (למשל he או en_US)`;
    // A template typed in by name may come without its text: then the variables are as many as chosen.
    if (body ? params.length !== variableCount(body) : params.length > 10) {
      return `יש לבחור מה נכנס בכל משתנה בתבנית של "${label}"`;
    }
    if (params.some((p) => !TEMPLATE_FIELDS[p])) return `ערך לא מוכר בתבנית של "${label}"`;
    clean[key] = { name, language, params, body };
  }
  await ensureColumn();
  await pool.query('UPDATE tenants SET whatsapp_templates = $1 WHERE id = $2', [
    Object.keys(clean).length ? JSON.stringify(clean) : null,
    tenantId,
  ]);
  return null;
}

// The template a message goes out on for this business: { name, language, buildParams(ctx),
// render(params) }, or null for a message with no template.
export async function templateFor(tenantId, eventType) {
  const t = (await getTemplateSettings(tenantId))[eventType] || DEFAULT_TEMPLATES[eventType];
  if (!t) return null;
  return {
    name: t.name,
    language: t.language || 'he',
    // A link always gets a space before it: a template written "קישור למשימה{{4}}" (task_overdue in
    // Meta is) glues it to the word, and WhatsApp on phones then links only part of the address.
    buildParams: (ctx) =>
      t.params.map((key) => {
        const value = String(TEMPLATE_FIELDS[key]?.value(ctx) ?? '') || '—';
        return key === 'link' && value !== '—' ? ` ${value}` : value;
      }),
    // for the outgoing log; a template saved without its text logs its name and values
    render: (params) =>
      t.body
        ? t.body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] ?? m)
        : [`[${t.name}]`, ...params].join('\n'),
  };
}
