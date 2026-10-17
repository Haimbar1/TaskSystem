import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAppContext } from '../context/AppContext.jsx';
import { STATUS_COLOR_OPTIONS } from '../constants.js';
import CloseSettingsButton from '../components/CloseSettingsButton.jsx';

// The business's task statuses (server/src/services/taskStatuses.js): their order is the Kanban
// columns, the first is where new tasks open, and "סטטוס סיום" ones (בוצע, נדחה…) complete the
// task — it gets a completion date there and loses it in any other status.
export default function StatusSettingsView() {
  const { statuses, setStatuses } = useAppContext();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(statuses.map((s) => ({ ...s })));
  }, [statuses]);

  function update(index, patch) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setMessage('');
  }

  function move(index, delta) {
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });
    setMessage('');
  }

  function remove(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setMessage('');
  }

  function add() {
    setRows((prev) => [...prev, { key: null, label: '', color: 'gray', is_final: false }]);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const r = await api.updateTaskStatuses(rows);
      setStatuses(r.statuses);
      setMessage('הסטטוסים נשמרו');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">סטטוסים של משימות</h2>
        <CloseSettingsButton />
      </div>
      <p className="text-gray-500 text-sm mb-3">
        הסדר כאן הוא סדר העמודות בקנבן, ומשימה חדשה נפתחת בסטטוס הראשון. סטטוס סיום (למשל "בוצע" או
        "נדחה") מסיים את המשימה: היא מקבלת תאריך ביצוע, ואם היא עוברת לסטטוס אחר — תאריך הביצוע נמחק.
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key || `new-${i}`} className="flex items-center gap-2 border rounded-lg p-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="למעלה"
                className="px-1 text-xs leading-none text-gray-500 disabled:opacity-25"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                title="למטה"
                className="px-1 text-xs leading-none text-gray-500 disabled:opacity-25"
              >
                ▼
              </button>
            </div>
            <span className={`w-3 h-3 rounded-full shrink-0 ${(STATUS_COLOR_OPTIONS[row.color] || STATUS_COLOR_OPTIONS.gray).bar}`} />
            <input
              value={row.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="שם הסטטוס"
              maxLength={40}
              className="border rounded p-1.5 text-sm flex-1 min-w-0"
            />
            <select
              value={row.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="border rounded p-1.5 text-sm bg-white"
            >
              {Object.entries(STATUS_COLOR_OPTIONS).map(([value, c]) => (
                <option key={value} value={value}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={!!row.is_final}
                onChange={(e) => update(i, { is_final: e.target.checked })}
              />
              סטטוס סיום
            </label>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={rows.length === 1}
              title="מחיקה"
              className="px-2 text-red-600 disabled:opacity-25"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg border text-sm">
          + סטטוס חדש
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50 mr-auto"
        >
          {saving ? 'שומר…' : 'שמור'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {message && <p className="text-sm text-gray-600 mt-3">{message}</p>}
    </div>
  );
}
