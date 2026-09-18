import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function CreateBusiness() {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!businessName.trim() || !email.trim() || !phone.trim()) {
      setError('חובה להזין שם עסק, מייל וטלפון');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await api.createTenant({ businessName, name, email, phone });
      setCreated(result.tenant);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function switchToNewTenant() {
    await api.switchTenant(created.id);
    window.location.href = '/';
  }

  if (created) {
    return (
      <div className="max-w-sm mx-auto bg-white border rounded-xl shadow-sm p-6 text-center space-y-4">
        <h2 className="text-lg font-bold">העסק "{created.name}" נוצר בהצלחה!</h2>
        <p className="text-gray-600 text-sm">
          המשתמש שהזנת יוכל להתחבר עם Google. אפשר גם לעבור לצפות בעסק הזה עכשיו.
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={switchToNewTenant} className="px-3 py-2 rounded-lg bg-emerald-600 text-white">
            עבור לעסק הזה
          </button>
          <button onClick={() => setCreated(null)} className="px-3 py-2 rounded-lg border">
            צור עסק נוסף
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto bg-white border rounded-xl shadow-sm p-6 space-y-3">
      <h1 className="text-lg font-bold mb-2">יצירת עסק חדש</h1>

      <div>
        <label className="block text-sm mb-1">שם העסק</label>
        <input
          className="w-full border rounded p-2"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">שם מנהל העסק</label>
        <input className="w-full border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm mb-1">מייל (חשבון Google)</label>
        <input
          type="email"
          className="w-full border rounded p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">טלפון</label>
        <input
          type="tel"
          placeholder="05XXXXXXXX"
          className="w-full border rounded p-2"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate('/')} className="px-3 py-2 rounded-lg border">
          ביטול
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
        >
          {saving ? 'יוצר…' : 'צור עסק'}
        </button>
      </div>
    </form>
  );
}
