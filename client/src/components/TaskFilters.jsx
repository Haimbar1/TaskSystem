import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext.jsx';
import { EMPTY_FILTERS } from '../taskFilters.js';

// The task search bar, shared by the table and both Kanbans (state in AppContext, so it stays when
// switching views; see taskFilters.js).
const DATE_FIELDS = { due_date: 'תאריך יעד', created_at: 'תאריך יצירה', completed_at: 'תאריך ביצוע' };
const PERIODS = { all: 'כל התאריכים', week: 'השבוע', month: 'החודש', range: 'בין תאריכים' };

export default function TaskFilters() {
  const { filters, setFilters } = useAppContext();
  // Typing is applied after a short pause, not on every key.
  const [text, setText] = useState(filters.q);
  useEffect(() => {
    if (text === filters.q) return;
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: text })), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const active = filters.q || filters.period !== 'all';
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
      {filters.period === 'range' && (
        <>
          <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className={field} />
          <span className="text-sm text-gray-500">עד</span>
          <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className={field} />
        </>
      )}
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
