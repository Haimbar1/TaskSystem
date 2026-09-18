import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext.jsx';
import { api } from '../api.js';
import TaskFormModal from './TaskFormModal.jsx';
import SettingsMenu from './SettingsMenu.jsx';
import { showWhatsAppPreview } from '../whatsappPreview.js';

export default function Nav() {
  const { user, bumpRefresh } = useAppContext();
  const [showTaskForm, setShowTaskForm] = useState(false);

  const canManageUsers = user?.role === 'admin' || user?.is_super_admin;
  const linkClass = ({ isActive }) =>
    `px-3 py-2 rounded ${isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`;

  async function handleLogout() {
    await api.logout();
    window.location.reload();
  }

  return (
    <>
      <nav className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
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
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            + משימה חדשה
          </button>
          <span className="text-sm text-gray-600">{user?.name || user?.email}</span>
          <button onClick={handleLogout} className="px-3 py-2 rounded border text-sm">
            התנתקות
          </button>
          <SettingsMenu user={user} canManageUsers={canManageUsers} />
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
