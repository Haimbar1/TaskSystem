import { useEffect, useState } from 'react';
import { api } from '../api.js';
import UserEditModal from '../components/UserEditModal.jsx';

const ROLE_LABELS = { admin: 'מנהל', member: 'חבר' };

export default function UsersView() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  function load() {
    api.getUsers().then(setUsers).catch(console.error);
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !phone.trim()) {
      setError('חובה להזין מייל וטלפון (הטלפון משמש לשליחת נוטיפיקציות בוואטסאפ)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.inviteUser({ email, name, phone });
      setName('');
      setEmail('');
      setPhone('');
      load();
    } catch (err) {
      setError('שגיאה בהוספת המשתמש (ייתכן שהמייל כבר קיים)');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function handleUserSaved(updated) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded p-4">
        <h2 className="font-semibold mb-3">הוספת משתמש</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-sm mb-1">שם</label>
            <input
              className="border rounded p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              מייל <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              className="border rounded p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">
              טלפון <span className="text-red-600">*</span>
            </label>
            <input
              type="tel"
              placeholder="05XXXXXXXX"
              className="border rounded p-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {saving ? 'מוסיף…' : 'הוסף משתמש'}
          </button>
        </form>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        <p className="text-gray-500 text-sm mt-2">
          המשתמש יוכל להתחבר עם Google לאחר שהוזמן. הטלפון חובה כדי שיוכל לקבל
          התראות בוואטסאפ.
        </p>
      </div>

      <table className="w-full bg-white border rounded">
        <thead>
          <tr>
            <th className="p-2 border-b text-right">שם</th>
            <th className="p-2 border-b text-right">מייל</th>
            <th className="p-2 border-b text-right">טלפון</th>
            <th className="p-2 border-b text-right">תפקיד</th>
            <th className="p-2 border-b"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">
                {u.phone || <span className="text-red-600">חסר טלפון</span>}
              </td>
              <td className="p-2">{ROLE_LABELS[u.role] || u.role}</td>
              <td className="p-2">
                <button
                  onClick={() => setEditingUser(u)}
                  className="text-blue-700 hover:underline text-sm"
                >
                  ערוך
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}
