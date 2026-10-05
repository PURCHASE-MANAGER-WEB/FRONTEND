// API client for the Purchase Manager portal.
// Talks to the STANDALONE Purchase Manager backend (same MongoDB, separate
// purchase_* collections). Set VITE_API_URL to the deployed backend, or to
// http://localhost:5003/api for local dev.
const API_BASE = import.meta.env.VITE_API_URL || 'https://api-purchasemanager.tescomanagement.com/api';

// This portal is locked to the Purchase Manager role.
export const APP_ROLE = 'purchase_manager';

// Session — identical keys/mechanism to the other CRM portals.
export const getToken = () => localStorage.getItem('crm_token');

export const setSession = (token, user) => {
  localStorage.setItem('crm_token', token);
  localStorage.setItem('crm_user', JSON.stringify(user));
  localStorage.setItem('crm_authenticated', 'true');
};

export const clearSession = () => {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  localStorage.removeItem('crm_authenticated');
};

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem('crm_user')); } catch { return null; }
};

export const isAuthenticated = () =>
  !!getToken() && localStorage.getItem('crm_authenticated') === 'true';

export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach server. Please check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface auth problems so the UI can bounce back to login.
    if (res.status === 401) { clearSession(); }
    const e = new Error(data.message || 'Request failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

export const authApi = {
  login: (role, email, password, designation) =>
    api('/auth/login', { method: 'POST', body: { role, email, password, ...(designation ? { designation } : {}) } }),
  logout: () => api('/auth/logout', { method: 'POST', auth: true }).catch(() => {}),
  forgotPassword: (email) =>
    api('/auth/forgot-password', { method: 'POST', body: { email } }),
  verifyOtp: (email, otp) =>
    api('/auth/verify-otp', { method: 'POST', body: { email, otp } }),
  resetPassword: (email, otp, newPassword) =>
    api('/auth/reset-password', { method: 'POST', body: { email, otp, newPassword } }),
  me: () => api('/auth/me', { auth: true }),
};

// Procurement data — role-guarded endpoints on the Purchase Manager backend.
// (suppliers → purchase_suppliers, orders → purchase_orders)
export const purchaseApi = {
  getVendors: () => api('/suppliers', { auth: true }),
  createVendor: (v) => api('/suppliers', { method: 'POST', body: v, auth: true }),
  updateVendor: (vid, v) => api(`/suppliers/${encodeURIComponent(vid)}`, { method: 'PUT', body: v, auth: true }),
  deleteVendor: (vid) => api(`/suppliers/${encodeURIComponent(vid)}`, { method: 'DELETE', auth: true }),
  getLines: () => api('/orders', { auth: true }),
  createLine: (l) => api('/orders', { method: 'POST', body: l, auth: true }),
  updateLine: (id, l) => api(`/orders/${encodeURIComponent(id)}`, { method: 'PUT', body: l, auth: true }),
  deleteLine: (id) => api(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }),
};
