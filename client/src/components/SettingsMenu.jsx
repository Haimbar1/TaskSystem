import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Everything here is admin-ish, low-frequency stuff (switch business, create
// a business, manage users) — tucked behind a gear icon so it doesn't
// compete with the day-to-day nav (table/kanban).
export default function SettingsMenu({ user, canManageUsers }) {
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    if (open && user?.is_super_admin) {
      api.getTenants().then(setTenants).catch(console.error);
    }
  }, [open, user?.is_super_admin]);

  async function switchTenant(tenantId) {
    if (tenantId === user.activeTenantId) return;
    await api.switchTenant(tenantId);
    window.location.href = '/';
  }

  if (!canManageUsers && !user?.is_super_admin) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="הגדרות"
        className="w-9 h-9 flex items-center justify-center rounded border bg-white text-lg"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute left-0 mt-1 bg-white border rounded shadow p-2 min-w-[220px] z-20 space-y-2">
          {canManageUsers && (
            <button
              onClick={() => {
                setOpen(false);
                navigate('/users');
              }}
              className="w-full text-right px-2 py-1 rounded hover:bg-gray-100 text-sm"
            >
              משתמשים
            </button>
          )}

          {user?.is_super_admin && (
            <>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/signup');
                }}
                className="w-full text-right px-2 py-1 rounded hover:bg-gray-100 text-sm"
              >
                עסק חדש
              </button>

              <div className="px-2 pt-1 border-t">
                <label className="block text-xs text-gray-500 mb-1">מעבר בין עסקים</label>
                <select
                  value={user.activeTenantId || ''}
                  onChange={(e) => switchTenant(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
