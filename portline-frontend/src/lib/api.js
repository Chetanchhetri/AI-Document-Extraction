const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function getApiBase() {
  if (typeof window === 'undefined') return DEFAULT_BASE
  return (localStorage.getItem('portline-api-base') || sessionStorage.getItem('portline-api-base') || DEFAULT_BASE).replace(/\/$/, '')
}

export function setApiBase(value) {
  if (typeof window !== 'undefined') {
    const cleanValue = value.replace(/\/$/, '')
    localStorage.setItem('portline-api-base', cleanValue)
    sessionStorage.setItem('portline-api-base', cleanValue)
  }
}

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

const getStoredToken = (key) => {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem(key) || localStorage.getItem(key) || ''
}

const setStoredToken = (key, value) => {
  if (typeof window === 'undefined') return
  if (value) {
    sessionStorage.setItem(key, value)
    localStorage.setItem(key, value)
  } else {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
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
  const authToken = token || getStoredToken('portline-access-token')
  const requestHeaders = { ...headers }
  if (authToken) requestHeaders.Authorization = `Bearer ${authToken}`
  if (body && !(body instanceof FormData) && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: requestHeaders,
      body: body instanceof FormData || typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError(`Cannot reach API at ${getApiBase()}. Check that FastAPI server is running and CORS allows this origin.`, 0, error)
  }

  if (response.status === 401 && retry && typeof window !== 'undefined') {
    const refreshToken = getStoredToken('portline-refresh-token')
    if (refreshToken && !path.endsWith('/auth/refresh')) {
      try {
        const refreshed = await request('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken }, retry: false })
        const nextAccess = refreshed?.access_token
        if (nextAccess) {
          setStoredToken('portline-access-token', nextAccess)
          if (refreshed?.refresh_token) setStoredToken('portline-refresh-token', refreshed.refresh_token)
          return request(path, { method, token: nextAccess, body, headers, responseType, retry: false })
        }
      } catch {
        setStoredToken('portline-access-token', null)
        setStoredToken('portline-refresh-token', null)
      }
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
    const access = token || getStoredToken('portline-access-token')
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
    signup: (data) => request('/api/v1/auth/signup', { 
      method: 'POST', 
      body: { email: data.email, password: data.password, full_name: data.full_name } 
    }),
    verifyOtp: (data) => request('/api/v1/auth/verify-otp', { 
      method: 'POST', 
      body: { email: data.email, otp: data.otp } 
    }),
    login: async (data) => {
      const payload = { 
        email: data.email || data.username, 
        password: data.password 
      }
      const res = await request('/api/v1/auth/login', { method: 'POST', body: payload, retry: false })
      if (res?.access_token) setStoredToken('portline-access-token', res.access_token)
      if (res?.refresh_token) setStoredToken('portline-refresh-token', res.refresh_token)
      return res
    },
    refresh: (refresh_token) => request('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token }, retry: false }),
    logout: async () => {
      try { await request('/api/v1/auth/logout', { method: 'POST' }) } catch {}
      setStoredToken('portline-access-token', null)
      setStoredToken('portline-refresh-token', null)
    },
  },
  
  users: {
    me: () => request('/api/v1/users/me'),
    list: () => request('/api/v1/users?skip=0&limit=50'),
    create: (data) => request('/api/v1/users', { 
      method: 'POST', 
      body: { 
        email: data.email, 
        password: data.password, 
        full_name: data.full_name, 
        role: data.role || 'executive',
        is_verified: data.is_verified ?? true,
        is_active: data.is_active ?? true
      } 
    }),
    update: (id, data) => {
      const payload = {}
      if (data.full_name !== undefined) payload.full_name = data.full_name
      if (data.role !== undefined) payload.role = data.role
      if (data.is_active !== undefined) payload.is_active = data.is_active
      if (data.is_verified !== undefined) payload.is_verified = data.is_verified
      return request(`/api/v1/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload })
    },
  },
  
  shipments: {
    list: (status = '') => request(`/api/v1/shipments?${status ? `status=${encodeURIComponent(status)}&` : ''}skip=0&limit=50`),
    get: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}`),
    create: (data) => {
      // Pluck strictly supplier string to prevent extra state keys like 'shipment_code'
      const supplierValue = typeof data === 'string' ? data : (data.supplier || data.supplier_name)
      return request('/api/v1/shipments', { 
        method: 'POST', 
        body: { supplier: supplierValue } 
      })
    },
    delete: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    documents: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/documents`),
    upload: (id, docType, file, replace = false, onProgress) => {
      const form = new FormData()
      form.append('doc_type', docType)
      form.append('file', file)
      const query = replace ? '?replace=true' : ''
      return uploadWithProgress(`/api/v1/shipments/${encodeURIComponent(id)}/documents${query}`, form, null, onProgress)
    },
    documentFile: (id) => request(`/api/v1/documents/${encodeURIComponent(id)}/file`, { responseType: 'blob' }),
    review: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/review`),
    updateField: (shipmentId, fieldId, value) => {
      const payload = typeof value === 'object' && value !== null
        ? { value: value.value || value.field_value, is_human_verified: value.is_human_verified ?? true }
        : { value: String(value), is_human_verified: true }
      return request(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/fields/${encodeURIComponent(fieldId)}`, { method: 'PATCH', body: payload })
    },
    verifyAll: (shipmentId) => request(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/verify-all`, { method: 'POST' }),
    overrideCheck: (shipmentId, checkId, reason) => request(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/cross-checks/${encodeURIComponent(checkId)}/override`, { 
      method: 'POST', 
      body: { override_reason: reason } 
    }),
    export: (id) => request(`/api/v1/shipments/${encodeURIComponent(id)}/export`, { responseType: 'blob' }),
  },
  
  hsn: {
    suggest: (item_description) => request('/api/v1/hsn/suggest', { 
      method: 'POST', 
      body: { item_description: typeof item_description === 'string' ? item_description : item_description?.item_description } 
    }),
  },
  
  analytics: {
    accuracy: () => request('/api/v1/analytics/accuracy'),
    auditLogs: () => request('/api/v1/analytics/audit-logs?skip=0&limit=100'),
  },
}

export const getErrorMessage = (error) => {
  if (!error) return 'Something went wrong. Please try again.'
  if (typeof error === 'string') return error
  if (error.message) return error.message
  if (error.payload?.detail) {
    if (typeof error.payload.detail === 'string') return error.payload.detail
    if (Array.isArray(error.payload.detail)) return error.payload.detail.map(d => d.msg || d.detail).join(', ')
  }
  return 'Something went wrong. Please try again.'
}