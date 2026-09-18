import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Per-business WhatsApp Business credentials (see server/src/routes/tenantRoutes.js).
// The access token is write-only here — the server never sends it back in
// full, only whether one is set — so the field starts blank even when a
// token already exists, and is left untouched on save unless retyped.
export default function WhatsAppSettingsView() {
  const [tokenSet, setTokenSet] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    api.getWhatsAppSettings().then((s) => {
      setTokenSet(s.whatsapp_access_token_set);
      setPhoneNumberId(s.whatsapp_phone_number_id);
      setWabaId(s.whatsapp_waba_id);
    });
  }

  useEffect(load, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const s = await api.updateWhatsAppSettings({
        whatsapp_access_token: accessToken,
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_waba_id: wabaId,
      });
      setTokenSet(s.whatsapp_access_token_set);
      setAccessToken('');
      setMessage('נשמר בהצלחה');
    } catch (err) {
      setMessage('שגיאה בשמירה');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-lg">
      <h2 className="font-semibold mb-3">הגדרות וואטסאפ לעסק</h2>
      <p className="text-gray-500 text-sm mb-3">
        המזהים האלה שייכים לעסק הנוכחי בלבד. אם לא ימולאו, המערכת תשתמש
        בברירת המחדל הגלובלית (אם קיימת).
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">
            Access Token {tokenSet && <span className="text-green-600">(מוגדר)</span>}
          </label>
          <input
            type="password"
            placeholder={tokenSet ? '••••••••  (השאירי ריק כדי לא לשנות)' : ''}
            className="border rounded p-2 w-full"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Phone Number ID</label>
          <input
            className="border rounded p-2 w-full"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">WABA ID</label>
          <input
            className="border rounded p-2 w-full"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {saving ? 'שומר…' : 'שמור'}
        </button>
        {message && <span className="text-sm text-gray-600 mr-3">{message}</span>}
      </form>
    </div>
  );
}
