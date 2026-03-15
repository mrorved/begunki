// ── API base URL ──────────────────────────────────────────────────────────────
// Local dev: http://localhost:8000/api
// Production behind nginx: /api (same domain)
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:8000/api'
  : '/api';

// ── Token storage ─────────────────────────────────────────────────────────────
const Auth = {
  token: null,
  user: null,

  save(data) {
    this.token = data.access_token;
    this.user = { id: data.user_id, role: data.role, full_name: data.full_name };
    sessionStorage.setItem('grd_token', data.access_token);
    sessionStorage.setItem('grd_user', JSON.stringify(this.user));
  },

  load() {
    this.token = sessionStorage.getItem('grd_token');
    const u = sessionStorage.getItem('grd_user');
    this.user = u ? JSON.parse(u) : null;
    return !!this.token;
  },

  clear() {
    this.token = null;
    this.user = null;
    sessionStorage.removeItem('grd_token');
    sessionStorage.removeItem('grd_user');
  },

  isAdmin() { return this.user && this.user.role === 'admin'; },
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;

  const resp = await fetch(API_BASE + path, { ...options, headers });

  if (resp.status === 401) {
    Auth.clear();
    showLogin();
    throw new Error('Сессия истекла, войдите снова');
  }

  if (!resp.ok) {
    let msg = `Ошибка ${resp.status}`;
    try { const e = await resp.json(); msg = e.detail || msg; } catch (_) {}
    throw new Error(msg);
  }

  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp;  // for file downloads
}

async function apiGet(path)         { return apiFetch(path, { method: 'GET' }); }
async function apiPost(path, body)  { return apiFetch(path, { method: 'POST',  body: JSON.stringify(body) }); }
async function apiPut(path, body)   { return apiFetch(path, { method: 'PUT',   body: JSON.stringify(body) }); }
async function apiDelete(path)      { return apiFetch(path, { method: 'DELETE' }); }

async function apiUpload(path, formData) {
  const headers = {};
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  const resp = await fetch(API_BASE + path, { method: 'POST', headers, body: formData });
  if (!resp.ok) {
    let msg = `Ошибка ${resp.status}`;
    try { const e = await resp.json(); msg = e.detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return resp.json();
}

// ── Specific API calls ────────────────────────────────────────────────────────
const API = {
  // Auth
  login: (username, password) => apiPost('/auth/login', { username, password }),

  // Products
  getProducts: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)));
    return apiGet(`/products?${qs}`);
  },
  getProductFilters: () => apiGet('/products/filters'),
  getProductByCode: (code) => apiGet(`/products/by-code/${encodeURIComponent(code)}`),
  importPrice: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload('/products/import', fd);
  },
  uploadPhoto: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiUpload('/products/upload-photo', fd);
  },

  // Clients
  getClients: () => apiGet('/clients'),
  createClient: (data) => apiPost('/clients', data),
  updateClient: (id, data) => apiPut(`/clients/${id}`, data),
  deleteClient: (id) => apiDelete(`/clients/${id}`),

  // Orders
  getOrders: () => apiGet('/orders'),
  createOrder: (data) => apiPost('/orders', data),
  updateOrder: (id, data) => apiPut(`/orders/${id}`, data),
  deleteOrder: (id) => apiDelete(`/orders/${id}`),
  submitOrder: (id) => apiPost(`/orders/${id}/submit`, {}),
  exportOrder: async (id) => {
    const headers = { 'Authorization': `Bearer ${Auth.token}` };
    const resp = await fetch(API_BASE + `/orders/${id}/export`, { headers });
    if (!resp.ok) throw new Error('Ошибка экспорта');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order_${id}.grd`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Admin
  getUsers: () => apiGet('/admin/users'),
  createUser: (data) => apiPost('/admin/users', data),
  updateUser: (id, data) => apiPut(`/admin/users/${id}`, data),
  deleteUser: (id) => apiDelete(`/admin/users/${id}`),
  getStats: () => apiGet('/admin/stats'),
};
