import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import CreateBusiness from './pages/CreateBusiness.jsx';
import TableView from './views/TableView.jsx';
import KanbanStatusView from './views/KanbanStatusView.jsx';
import KanbanAssigneeView from './views/KanbanAssigneeView.jsx';
import UsersView from './views/UsersView.jsx';
import WhatsAppSettingsView from './views/WhatsAppSettingsView.jsx';
import EmbedSettingsView from './views/EmbedSettingsView.jsx';
import WhatsAppPreviewModal from './components/WhatsAppPreviewModal.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { api } from './api.js';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Single Sign-On from the unified Portal: a ?sso_token=... means the portal already
    // verified this user and is handing off a short-lived token. The server (not this
    // page) verifies it and sets the real session cookie, so just forward the whole
    // browser there — it redirects back here once logged in.
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso_token');
    if (ssoToken) {
      window.location.href = `${API_URL}/api/auth/sso?token=${encodeURIComponent(ssoToken)}`;
      return;
    }
    // Embedded in another system (e.g. Monday) with a per-business token — same hand-off.
    const embedToken = params.get('embed_token');
    if (embedToken) {
      window.location.href = `${API_URL}/api/auth/embed?token=${encodeURIComponent(embedToken)}`;
      return;
    }
    api.me().then((res) => setUser(res.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!user) return <Login />;

  const canManageUsers = user.role === 'admin' || user.is_super_admin;

  return (
    <AppProvider user={user}>
      <div dir="rtl" className="min-h-screen bg-gray-50">
        <Nav />
        <main className="p-4 max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={<TableView />} />
            <Route path="/kanban/status" element={<KanbanStatusView />} />
            <Route path="/kanban/assignee" element={<KanbanAssigneeView />} />
            <Route
              path="/users"
              element={canManageUsers ? <UsersView /> : <Navigate to="/" replace />}
            />
            <Route
              path="/whatsapp-settings"
              element={canManageUsers ? <WhatsAppSettingsView /> : <Navigate to="/" replace />}
            />
            <Route
              path="/embed-settings"
              element={canManageUsers ? <EmbedSettingsView /> : <Navigate to="/" replace />}
            />
            <Route
              path="/signup"
              element={user.is_super_admin ? <CreateBusiness /> : <Navigate to="/" replace />}
            />
          </Routes>
        </main>
      </div>
      <WhatsAppPreviewModal />
    </AppProvider>
  );
}
