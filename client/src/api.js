const API_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getTasks: (params = {}) => request(`/api/tasks?${new URLSearchParams(params)}`),
  createTask: (data) => request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
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
