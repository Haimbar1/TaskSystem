import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const PORTAL_URL = 'https://portal.smartesek.com';
const API_URL = import.meta.env.VITE_API_URL || '';

// The same gear, in the same place (right after the app switcher), with the same menu layout in
// every SmartEsek app: portal admin link, app settings, WhatsApp/integrations, log out.
export default function SettingsMenu({ user, canManageUsers, onLogout }) {
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

  // The list comes from the portal (where businesses are managed); see /switcher/tenants.
  useEffect(() => {
    if (open && user?.is_super_admin) {
      api
        .getSwitcherTenants()
        .then((r) => setTenants(r.tenants))
        .catch(console.error);
    }
  }, [open, user?.is_super_admin]);

  // Switching is a portal SSO login into the chosen business (creates it here if it's new).
  async function switchTenant(portalTenantId) {
    if (!portalTenantId || Number(portalTenantId) === user.activePortalTenantId) return;
    try {
      const { ssoToken } = await api.getSwitchTenantToken(Number(portalTenantId));
      window.location.href = `${API_URL}/api/auth/sso?token=${encodeURIComponent(ssoToken)}`;
    } catch (err) {
      console.error(err);
      window.alert('לא ניתן לעבור לעסק הזה');
    }
  }

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };
  const itemClass = 'w-full text-right px-2.5 py-1.5 rounded-lg hover:bg-gray-100 text-sm';
  const sectionClass = 'px-2.5 pt-2 pb-0.5 text-[10px] font-bold text-gray-400';
  const hasAppItems = canManageUsers || user?.is_super_admin;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="הגדרות"
        className="p-2 rounded-lg text-teal-50 hover:bg-white/10 transition-colors text-lg leading-none"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-40 text-gray-900">
          {canManageUsers && (
            <a
              href={PORTAL_URL}
              target="_blank"
              rel="noopener"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-sm font-bold text-blue-800"
            >
              <span>ניהול עסק ומשתמשים</span>
              <span>↗</span>
            </a>
          )}

          {/* Users and new businesses are managed in the portal (link above), not here. */}
          {hasAppItems && <div className={sectionClass}>הגדרות האפליקציה</div>}
          {user?.is_super_admin && (
            <>
              <div className="px-2.5 pt-1">
                <label className="block text-xs text-gray-500 mb-1">מעבר בין עסקים</label>
                <select
                  value={user.activePortalTenantId ?? ''}
                  onChange={(e) => switchTenant(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm bg-white"
                >
                  {/* Current business isn't linked to the portal (pre-portal leftover). */}
                  {user.activePortalTenantId == null && (
                    <option value="">{user.activeTenantName || 'עסק נוכחי'} (לא מקושר לפורטל)</option>
                  )}
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {canManageUsers && (
            <>
              <div className={sectionClass}>וואטסאפ ואינטגרציות</div>
              <button onClick={() => go('/whatsapp-settings')} className={itemClass}>
                הגדרות וואטסאפ
              </button>
              {user?.is_super_admin && (
                <button onClick={() => go('/embed-settings')} className={itemClass}>
                  הטמעה ב-Monday
                </button>
              )}
              {/* Only for an embedded business (activeTenantHasEmbed is super-admin only): its
                  people never log in through the portal, so they're managed here. */}
              {user?.activeTenantHasEmbed && (
                <button onClick={() => go('/users')} className={itemClass}>
                  משתמשי העסק (Monday)
                </button>
              )}
            </>
          )}

          <div className="border-t border-gray-100 mt-1.5 pt-1">
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className={itemClass}
            >
              התנתקות
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
