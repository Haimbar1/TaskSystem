import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getActingUserId, setActingUserId } from '../actingUser.js';

// "Who am I" for the shared Monday login (see actingUser.js): picked once per device and recorded
// as the one who did each action in the action log. Amber until someone is picked.
export default function ActingUserPicker() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(getActingUserId());

  useEffect(() => {
    api
      .getUsers()
      .then((list) => {
        setUsers(list);
        // Drop a remembered person who's no longer in this business.
        if (selected && !list.some((u) => u.id === selected)) {
          setActingUserId('');
          setSelected('');
        }
      })
      .catch(console.error);
    const sync = () => setSelected(getActingUserId());
    window.addEventListener('acting-user-changed', sync);
    return () => window.removeEventListener('acting-user-changed', sync);
  }, []);

  return (
    <label className="flex items-center gap-1.5 text-sm text-teal-100/80">
      <span className="hidden md:inline">מי את/ה?</span>
      <select
        value={selected}
        onChange={(e) => {
          setActingUserId(e.target.value);
          setSelected(e.target.value);
        }}
        className={`rounded-lg px-2 py-1.5 text-sm text-gray-900 ${selected ? 'bg-white' : 'bg-amber-200'}`}
      >
        <option value="">בחר/י…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name || u.email}
          </option>
        ))}
      </select>
    </label>
  );
}
