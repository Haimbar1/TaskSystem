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
  getTenants: () => request('/api/tenants'),
  createTenant: (data) => request('/api/tenants', { method: 'POST', body: JSON.stringify(data) }),
  switchTenant: (tenantId) => request('/api/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenantId }) }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};
