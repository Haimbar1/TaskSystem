import { useState } from 'react';
import { api } from '../api.js';

// Email isn't editable here — it's the identity key Google login matches
// on (see server/src/auth/googleStrategy.js), so it's shown read-only.
export default function UserEditModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim()) {
      setError('חובה להזין טלפון');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await api.updateUser(user.id, { name, phone });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded p-4 w-full max-w-sm space-y-3">
        <h2 className="text-lg font-bold">עריכת משתמש</h2>

        <div>
          <label className="block text-sm mb-1">מייל</label>
          <input className="w-full border rounded p-2 bg-gray-100 text-gray-500" value={user.email} disabled />
        </div>

        <div>
          <label className="block text-sm mb-1">שם</label>
          <input className="w-full border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm mb-1">
            טלפון <span className="text-red-600">*</span>
          </label>
          <input
            type="tel"
            className="w-full border rounded p-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border">
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </form>
    </div>
  );
}
