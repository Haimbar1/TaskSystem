import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { setActingUserId } from '../actingUser.js';

// "מי את/ה?" inside Monday, asked the first time something needs to know who's acting (a change,
// "me" in the filters) and nobody was picked on this device yet; see actingUser.js. The choice is
// remembered, so it isn't asked again (it can be changed in the top bar).
export default function ActingUserPrompt() {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    const ask = () => {
      setOpen(true);
      setSelected('');
      api.getUsers().then(setUsers).catch(() => setUsers([]));
    };
    window.addEventListener('acting-user-needed', ask);
    return () => window.removeEventListener('acting-user-needed', ask);
  }, []);

  if (!open) return null;

  function answer(id) {
    if (id) setActingUserId(id);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('acting-user-answered', { detail: { id } }));
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (selected) answer(selected);
        }}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
      >
        <div>
          <h2 className="text-lg font-bold">מי את/ה?</h2>
          <p className="text-sm text-gray-600 mt-1">
            כדי שיהיה ידוע מי ביצע את הפעולה. נבחר פעם אחת — המערכת תזכור את הבחירה במכשיר הזה.
          </p>
        </div>
        {users === null ? (
          <p className="text-sm text-gray-500">טוען…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-amber-700">אין עדיין אנשים בעסק — יש להוסיף אותם תחת "משתמשים".</p>
        ) : (
          <select
            autoFocus
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`w-full border rounded-lg p-2 ${selected ? '' : 'bg-amber-50'}`}
          >
            <option value="">בחר/י…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => answer('')} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
            ביטול
          </button>
          <button
            type="submit"
            disabled={!selected}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            אישור
          </button>
        </div>
      </form>
    </div>
  );
}
