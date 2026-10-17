import { getActingUserId } from './actingUser.js';

const API_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const actingUser = getActingUserId();
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(actingUser && { 'X-Acting-User': actingUser }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Saving a task sends WhatsApp notifications server-side and returns them as `whatsappMessages`;
// announce them so WhatsAppSentToast can tell the user who got one.
function announceWhatsApp(task) {
  if (task?.whatsappMessages?.length) {
    window.dispatchEvent(new CustomEvent('whatsapp-sent', { detail: task.whatsappMessages }));
  }
  return task;
}

// For the help assistant (components/HelpWidget.tsx): a plain fetch with this site's login cookie
export const helpFetch = (path, init = {}) => fetch(`${API_URL}${path}`, { credentials: 'include', ...init });

export const api = {
  getTasks: (params = {}) => request(`/api/tasks?${new URLSearchParams(params)}`),
  getPendingTask: () => request('/api/tasks/pending-open'),
  createTask: (data) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }).then(announceWhatsApp),
  updateTask: (id, data) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(announceWhatsApp),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
  getTaskNotes: (id) => request(`/api/tasks/${id}/notes`),
  addTaskNote: (id, body) => request(`/api/tasks/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  getUsers: () => request('/api/users'),
  inviteUser: (data) => request('/api/users/invite', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  getSwitcherTenants: () => request('/api/auth/switcher/tenants'),
  getSwitchTenantToken: (portalTenantId) =>
    request('/api/auth/switcher/tenant', { method: 'POST', body: JSON.stringify({ portalTenantId }) }),
  createTenant: (data) => request('/api/tenants', { method: 'POST', body: JSON.stringify(data) }),
  getWhatsAppSettings: () => request('/api/tenants/whatsapp-settings'),
  updateWhatsAppSettings: (data) =>
    request('/api/tenants/whatsapp-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  getWhatsAppLog: () => request('/api/tenants/whatsapp-log'),
  getAuditLog: () => request('/api/tenants/audit-log'),
  getTaskStatuses: () => request('/api/tenants/task-statuses'),
  updateTaskStatuses: (statuses) =>
    request('/api/tenants/task-statuses', { method: 'PUT', body: JSON.stringify({ statuses }) }),
  getEmbedToken: () => request('/api/tenants/embed-token'),
  rotateEmbedToken: () => request('/api/tenants/embed-token', { method: 'POST' }),
  clearEmbedToken: () => request('/api/tenants/embed-token', { method: 'DELETE' }),
  switchTenant:(tenantId) => request('/api/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenantId }) }),
  me: () => request('/api/auth/me'),
  getSwitcherModules: () => request('/api/auth/switcher/modules'),
  getSwitcherToken: (moduleKey) =>
    request('/api/auth/switcher/token', { method: 'POST', body: JSON.stringify({ moduleKey }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};
