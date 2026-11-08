import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ensureActingUser, useActingUserId } from '../actingUser.js';
import { useAppContext } from '../context/AppContext.jsx';
import { EMPTY_FILTERS } from '../taskFilters.js';

// The task search bar, shared by the table and both Kanbans (state in AppContext, so it stays when
// switching views; see taskFilters.js).
const DATE_FIELDS = { due_date: 'תאריך יעד', created_at: 'תאריך יצירה', completed_at: 'תאריך ביצוע' };
const PERIODS = { all: 'כל התאריכים', week: 'השבוע', month: 'החודש', range: 'בין תאריכים' };
// By person: who opened the task, or who opened it or is responsible for it.
const WHO = { '': 'כל הפותחים', created: 'נפתחו ע״י', mine: 'נפתחו ע״י או באחריות' };

export default function TaskFilters() {
  const { filters, setFilters, user } = useAppContext();
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error);
  }, []);
  // "Me": the logged-in person, or inside Monday whoever was picked in "מי את/ה?".
  const actingId = useActingUserId();
  const meId = user?.is_embed ? actingId : user?.id;
  // Typing is applied after a short pause, not on every key.
  const [text, setText] = useState(filters.q);
  useEffect(() => {
    if (text === filters.q) return;
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: text })), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const active = filters.q || filters.period !== 'all' || filters.archived || filters.who;
  const field = 'border rounded-lg px-2 py-1.5 text-sm bg-white';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="🔍 חיפוש: משימה, תיאור, הערות, אחראי, סטטוס, עדיפות"
        title="חיפוש בכותרת, בתיאור, בהערות, בשמות האחראים, בסטטוס ובעדיפות"
        className={`${field} w-full sm:w-80`}
      />
      <select value={filters.period} onChange={(e) => set({ period: e.target.value })} className={field}>
        {Object.entries(PERIODS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {filters.period !== 'all' && (
        <select value={filters.dateField} onChange={(e) => set({ dateField: e.target.value })} className={field}>
          {Object.entries(DATE_FIELDS).map(([value, label]) => (
            <option key={value} value={value}>
              לפי {label}
            </option>
          ))}
        </select>
      )}
      <select
        value={filters.who}
        // Choosing a person filter starts with me (unless someone was already chosen).
        onChange={async (e) => {
          const who = e.target.value;
          if (!who) return set({ who, whoId: '' });
          if (filters.whoId) return set({ who });
          // Starts with "me" — inside Monday that's asked first if nobody was picked yet.
          const me = user?.is_embed ? await ensureActingUser().catch(() => '') : meId;
          set({ who, whoId: me || '' });
        }}
        className={field}
        title="סינון לפי מי שפתח את המשימה — או גם מי שאחראי עליה"
      >
        {Object.entries(WHO).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {filters.who && (
        <select
          value={filters.whoId}
          onChange={(e) => set({ whoId: e.target.value })}
          className={`${field} ${filters.whoId ? '' : 'bg-amber-200'}`}
        >
          <option value="">בחר/י…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === meId ? `אני (${u.name || u.email})` : u.name || u.email}
            </option>
          ))}
        </select>
      )}
      {filters.period === 'range' && (
        <>
          <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className={field} />
          <span className="text-sm text-gray-500">עד</span>
          <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className={field} />
        </>
      )}
      {/* Archived tasks (a week after completion, or by hand) show only when asked for */}
      <label
        className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none"
        title="משימות שהסתיימו עוברות לארכיון שבוע אחרי הביצוע (או בלחיצה על 'העבר לארכיון' בחלון המשימה)"
      >
        <input type="checkbox" checked={!!filters.archived} onChange={(e) => set({ archived: e.target.checked })} />
        כולל ארכיון
      </label>
      {active && (
        <button
          type="button"
          onClick={() => {
            setText('');
            setFilters(EMPTY_FILTERS);
          }}
          className="px-2 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
        >
          ✕ ניקוי
        </button>
      )}
    </div>
  );
}
