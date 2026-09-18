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
import WhatsAppPreviewModal from './components/WhatsAppPreviewModal.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { api } from './api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
