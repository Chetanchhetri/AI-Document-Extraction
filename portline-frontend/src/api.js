// All backend calls live here. Paths/methods/bodies mirror the Postman collection.
const LS = localStorage;
export const getBase = () => LS.getItem('baseUrl') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const setBase = (v) => LS.setItem('baseUrl', v.trim().replace(/\/+$/, ''));
export const tokens = {
  get access() { return LS.getItem('access'); },
  get refresh() { return LS.getItem('refresh'); },
  set(a, r) { if (a) LS.setItem('access', a); if (r) LS.setItem('refresh', r); },
  clear() { LS.removeItem('access'); LS.removeItem('refresh'); },
};
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}
const explain = (d) => {
  if (!d) return 'Request failed';
  if (typeof d === 'string') return d;
  const x = d.detail ?? d.message ?? d.error;
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const bl = (x.blockers || []).map((b) => (typeof b === 'string' ? b : b.message ?? b.detail ?? JSON.stringify(b)));
    return [x.message, ...bl].filter(Boolean).join(' • ') || JSON.stringify(x);
  }
  if (Array.isArray(x)) return x.map((e) => `${(e.loc || []).slice(1).join('.') || 'request'}: ${e.msg}`).join('; ');
  return JSON.stringify(d);
};

let refreshing = null;
function refreshTokens() {
  if (!tokens.refresh) return Promise.resolve(false);
  refreshing ||= fetch(getBase() + '/api/v1/auth/refresh', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh }),
  })
    .then(async (r) => { if (!r.ok) return false; const d = await r.json(); tokens.set(d.access_token, d.refresh_token); return !!d.access_token; })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function raw(path, opts = {}, retry = true) {
  const { method = 'GET', json, form, auth = true, query } = opts;
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)) : '';
  const headers = {};
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(getBase() + path + qs, { method, headers, body: json !== undefined ? JSON.stringify(json) : form });
  } catch {
    throw new ApiError(0, `Network error on ${method} ${path}. If GET requests work, your backend CORS config is blocking this method or header: allow_methods must include PATCH and DELETE, allow_headers must include Authorization, and expose_headers should include Content-Disposition.`);
  }
  if (r.status === 401 && auth && retry && (await refreshTokens())) return raw(path, opts, false);
  if (!r.ok) {
    let d; const t = await r.text().catch(() => '');
    try { d = JSON.parse(t); } catch { d = t; }
    if (r.status === 401 && auth) { tokens.clear(); window.dispatchEvent(new Event('auth:expired')); }
    throw new ApiError(r.status, explain(d), d);
  }
  return r;
}
async function j(path, opts) {
  const r = await raw(path, opts);
  const t = await r.text();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return t; }
}
async function file(path) {
  const r = await raw(path);
  const cd = r.headers.get('content-disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return { blob: await r.blob(), filename: m ? decodeURIComponent(m[1]) : null };
}
export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const V = '/api/v1';
async function firstOk(path, method, bodies) { // retry alternate body keys when the schema rejects extras (422)
  let last;
  for (const b of bodies) { try { return await j(path, { method, json: b }); } catch (e) { last = e; if (e.status !== 422) throw e; } }
  throw last;
}
export const api = {
  health: () => j('/health', { auth: false }),
  // 1. Auth
  resendOtp: (email) => j(`${V}/auth/resend-otp`, { method: 'POST', json: { email }, auth: false }),
  signup: (b) => j(`${V}/auth/signup`, { method: 'POST', json: b, auth: false }), // {email,password,full_name}
  verifyOtp: (b) => j(`${V}/auth/verify-otp`, { method: 'POST', json: b, auth: false }), // {email,otp}
  login: (b) => j(`${V}/auth/login`, { method: 'POST', json: b, auth: false }), // {email,password}
  logout: () => j(`${V}/auth/logout`, { method: 'POST', json: { refresh_token: tokens.refresh } }),
  // 2. Users
  me: () => j(`${V}/users/me`),
  users: (skip = 0, limit = 50) => j(`${V}/users`, { query: { skip, limit } }),
  createUser: ({ email, password, full_name, role }) => j(`${V}/users`, { method: 'POST', json: { email, password, full_name, role } }), // new users get an OTP email
  patchUser: (id, b) => j(`${V}/users/${id}`, { method: 'PATCH', json: b }), // {role} | {is_active}
  // 3. Shipments
  createShipment: (supplier) => firstOk(`${V}/shipments`, 'POST', [{ supplier_name: supplier }, { supplier }, { supplier_name: supplier, supplier }]), // code is generated by the server
  shipments: ({ status, skip = 0, limit = 20 } = {}) => j(`${V}/shipments`, { query: { status, skip, limit } }),
  shipment: (id) => j(`${V}/shipments/${id}`),
  deleteShipment: (id) => j(`${V}/shipments/${id}`, { method: 'DELETE' }),
  // 4. Documents
  uploadDoc: (id, doc_type, f, replace = false) => { const fd = new FormData(); fd.append('doc_type', doc_type); fd.append('file', f); return j(`${V}/shipments/${id}/documents`, { method: 'POST', form: fd, query: replace ? { replace: 'true' } : undefined }); },
  docs: (id) => j(`${V}/shipments/${id}/documents`),
  docFile: (docId) => file(`${V}/documents/${docId}/file`),
  deleteDoc: (shipmentId, docId) => j(`${V}/shipments/${shipmentId}/documents/${docId}`, { method: 'DELETE' }),
  deleteDocDirect: (docId) => j(`${V}/documents/${docId}`, { method: 'DELETE' }),
  // 5. Review
  review: (id) => j(`${V}/shipments/${id}/review`),
  patchField: (sid, fid, value) => firstOk(`${V}/shipments/${sid}/fields/${fid}`, 'PATCH', [{ value, field_value: value, is_human_verified: true }, { value, is_human_verified: true }, { field_value: value, is_human_verified: true }]), // unchanged value = verify, changed = edit
  verifyAll: (sid) => j(`${V}/shipments/${sid}/verify-all`, { method: 'POST' }),
  override: (sid, cid, override_reason) => j(`${V}/shipments/${sid}/cross-checks/${cid}/override`, { method: 'POST', json: { override_reason } }),
  // 6. Export
  exportXlsx: (id) => file(`${V}/shipments/${id}/export`),
  // 7. HSN
  hsn: (d) => firstOk(`${V}/hsn/suggest`, 'POST', [{ description: d }, { description: d, item_description: d }, { item_description: d }]), // backend reads `description`
  // 8. Analytics
  accuracy: () => j(`${V}/analytics/accuracy`),
  auditLogs: (skip = 0, limit = 100) => j(`${V}/analytics/audit-logs`, { query: { skip, limit } }),
};