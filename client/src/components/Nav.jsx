import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext.jsx';
import { api } from '../api.js';
import TaskFormModal from './TaskFormModal.jsx';
import SettingsMenu from './SettingsMenu.jsx';
import AppSwitcher from './AppSwitcher.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';

export default function Nav() {
  const { user, bumpRefresh } = useAppContext();
  const [showTaskForm, setShowTaskForm] = useState(false);

  const canManageUsers = user?.role === 'admin' || user?.is_super_admin;
  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-white text-teal-900' : 'text-teal-50/80 hover:bg-white/10 hover:text-white'
    }`;

  async function handleLogout() {
    await api.logout();
    window.location.reload();
  }

  return (
    <>
      <nav className="bg-gradient-to-l from-teal-950 to-teal-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppSwitcher />
            <SettingsMenu user={user} canManageUsers={canManageUsers} onLogout={handleLogout} />
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold">
              מ
            </div>
            <div className="hidden sm:block">
              <div className="font-bold leading-tight">מערכת ניהול משימות</div>
              {user?.activeTenantName && (
                <div className="text-xs text-teal-100/70 leading-tight">{user.activeTenantName}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              טבלה
            </NavLink>
            <NavLink to="/kanban/status" className={linkClass}>
              קנבן לפי סטטוס
            </NavLink>
            <NavLink to="/kanban/assignee" className={linkClass}>
              קנבן לפי אחראי
            </NavLink>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTaskForm(true)}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium transition-colors"
            >
              + משימה חדשה
            </button>
            <span className="hidden md:inline text-sm text-teal-100/80">
              {user?.name || user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-lg border border-white/20 text-sm text-teal-50 hover:bg-white/10 transition-colors"
            >
              התנתקות
            </button>
          </div>
        </div>
      </nav>

      {showTaskForm && (
        <TaskFormModal
          onClose={() => setShowTaskForm(false)}
          onCreated={(saved) => {
            bumpRefresh();
            showWhatsAppPreview(saved.whatsappPreviews);
          }}
        />
      )}
    </>
  );
}
