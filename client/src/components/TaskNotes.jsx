import { useEffect, useState } from 'react';
import { api } from '../api.js';

// "הערות ביצוע" in the task form (server/src/services/taskNotes.js): each note shows who wrote it
// and when — the server signs it, nobody types that in.
function formatTime(value) {
  return new Date(value).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TaskNotes({ taskId }) {
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getTaskNotes(taskId)
      .then(setNotes)
      .catch((err) => {
        console.error(err);
        setError('לא ניתן לטעון את ההערות');
      });
  }, [taskId]);

  async function add() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const note = await api.addTaskNote(taskId, draft);
      setNotes((prev) => [...(prev || []), note]);
      setDraft('');
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת ההערה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="block text-sm mb-1">הערות ביצוע</label>
      {notes?.length > 0 && (
        <div className="border rounded p-2 mb-2 max-h-56 overflow-y-auto space-y-2 bg-gray-50">
          {notes.map((n) => (
            <div key={n.id} className="bg-white border rounded p-2">
              <div className="text-xs text-gray-500 mb-1">
                <span className="font-medium text-gray-700">{n.author_name || '—'}</span>
                {n.via_monday && <span className="text-violet-700"> · דרך Monday</span>} · {formatTime(n.created_at)}
              </div>
              <div className="text-sm whitespace-pre-wrap">{n.body}</div>
            </div>
          ))}
        </div>
      )}
      <textarea
        className="w-full border rounded p-2 text-sm resize-y"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="מה נעשה, מה נשאר, מה חשוב לדעת…"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">שם הכותב, התאריך והשעה נוספים אוטומטית.</p>
        <button
          type="button"
          onClick={add}
          disabled={saving || !draft.trim()}
          className="px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 text-sm disabled:opacity-40"
        >
          {saving ? 'שומר…' : 'הוסף הערה'}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
