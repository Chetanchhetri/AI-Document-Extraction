const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function getApiBase() {
  if (typeof window === 'undefined') return DEFAULT_BASE
  return (localStorage.getItem('portline-api-base') || DEFAULT_BASE).replace(/\/$/, '')
}

export function setApiBase(value) {
  if (typeof window !== 'undefined') localStorage.setItem('portline-api-base', value.replace(/\/$/, ''))
}

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

const readPayload = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try { return await response.json() } catch { return null }
  }
  if (response.status === 204) return null
  return await response.text().catch(() => null)
}

async function request(path, { method = 'GET', token, body, headers = {}, responseType = 'json', retry = true } = {}) {
  const authToken = token || (typeof window !== 'undefined' ? sessionStorage.getItem('portline-access-token') : '')
  const requestHeaders = { ...headers }
  if (authToken) requestHeaders.Authorization = `Bearer ${authToken}`
  if (body && !(body instanceof FormData) && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: requestHeaders,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError(`Cannot reach API at ${getApiBase()}. Check that the FastAPI server is running and CORS allows this origin.`, 0, error)
  }

  if (response.status === 401 && retry && typeof window !== 'undefined') {
    const refreshToken = sessionStorage.getItem('portline-refresh-token')
    if (refreshToken && !path.endsWith('/auth/refresh')) {
      try {
        const refreshed = await request('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken }, retry: false })
        const nextAccess = refreshed?.access_token
        if (nextAccess) {
          sessionStorage.setItem('portline-access-token', nextAccess)
          if (refreshed?.refresh_token) sessionStorage.setItem('portline-refresh-token', refreshed.refresh_token)
          return request(path, { method, token: nextAccess, body, headers, responseType, retry: false })
        }
      } catch { /* surface the original unauthorized response below */ }
    }
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      const payload = await readPayload(response)
      throw new ApiError(payload?.detail || payload?.message || `Request failed (${response.status})`, response.status, payload)
    }
    return { blob: await response.blob(), headers: response.headers }
  }

  const payload = await readPayload(response)
  if (!response.ok) {
    const message = payload?.detail || payload?.message || payload?.error || (typeof payload === 'string' ? payload : `Request failed (${response.status})`)
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), response.status, payload)
  }
  return payload
}

function uploadWithProgress(path, formData, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${getApiBase()}${path}`)
    const access = token || sessionStorage.getItem('portline-access-token')
    if (access) xhr.setRequestHeader('Authorization', `Bearer ${access}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      let payload = null
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { payload = xhr.responseText }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
      else reject(new ApiError(payload?.detail || payload?.message || `Upload failed (${xhr.status})`, xhr.status, payload))
    }
    xhr.onerror = () => reject(new ApiError('Network error while uploading document.', 0))
    xhr.onabort = () => reject(new ApiError('Upload cancelled.', 0))
    xhr.send(formData)
  })
}

export const api = {
  health: () => request('/health'),
  auth: {
    signup: (data) => request('/api/v1/auth/signup', { method: 'POST', body: data }),
    verifyOtp: (data) => request('/api/v1/auth/verify-otp', { method: 'POST', body: data }),
    login: (data) => request('/api/v1/auth/login', { method: 'POST', body: data, retry: false }),
    refresh: (refresh_token) => request('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token }, retry: false }),
    logout: () => request('/api/v1/auth/logout', { method: 'POST' }),
  },
  users: {
    me: () => request('/api/v1/users/me'),
    list: () => request('/api/v1/users?skip=0&limit=50'),
    create: (data) => request('/api/v1/users', { method: 'POST', body: data }),
    update: (id, data) => request(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
  },
  shipments: {
    list: (status = '') => request(`/api/v1/shipments?${status ? `status=${encodeURIComponent(status)}&` : ''}skip=0&limit=50`),
    get: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}`),
    create: (data) => request('/api/v1/shipments', { method: 'POST', body: data }),
    delete: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    documents: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/documents`),
    upload: (id, docType, file, onProgress) => {
      const form = new FormData()
      form.append('doc_type', docType)
      form.append('file', file)
      return uploadWithProgress(`/api/v1/shipments/${encodeURIComponent(id)}/documents`, form, null, onProgress)
    },
    documentFile: (id) => request(`/api/v1/documents/${encodeURIComponent(id)}/file`, { responseType: 'blob' }),
    review: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/review`),
    updateField: (shipmentId, fieldId, data) => request(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/fields/${encodeURIComponent(fieldId)}`, { method: 'PATCH', body: data }),
    overrideCheck: (shipmentId, checkId, reason) => request(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/cross-checks/${encodeURIComponent(checkId)}/override`, { method: 'POST', body: { override_reason: reason } }),
    export: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/export`, { responseType: 'blob' }),
  },
  hsn: {
    suggest: (item_description) => request('/api/v1/hsn/suggest', { method: 'POST', body: { item_description } }),
  },
  analytics: {
    accuracy: () => request('/api/v1/analytics/accuracy'),
    auditLogs: () => request('/api/v1/analytics/audit-logs?skip=0&limit=100'),
  },
}

export const getErrorMessage = (error) => error?.message || 'Something went wrong. Please try again.'
