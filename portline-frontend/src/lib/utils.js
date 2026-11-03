import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) { return twMerge(clsx(inputs)) }

export function unwrapList(payload, keys = []) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const key of [...keys, 'items', 'results', 'data', 'records', 'users', 'shipments', 'documents', 'logs']) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  if (payload.data && typeof payload.data === 'object') {
    for (const key of [...keys, 'items', 'results', 'records', 'users', 'shipments', 'documents', 'logs']) {
      if (Array.isArray(payload.data[key])) return payload.data[key]
    }
  }
  return []
}

export const humanize = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
export const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}
export const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
export const statusTone = (status = '') => {
  const s = String(status).toLowerCase()
  if (['approved', 'exported', 'passed', 'ready', 'complete', 'completed'].some((x) => s.includes(x))) return 'success'
  if (['review', 'pending', 'processing', 'warning', 'low'].some((x) => s.includes(x))) return 'warning'
  if (['blocked', 'failed', 'error', 'rejected'].some((x) => s.includes(x))) return 'danger'
  return 'neutral'
}

export function normalizeShipment(item, index = 0) {
  return {
    id: item.id ?? item.shipment_id ?? item.pk ?? `local-${index}`,
    code: item.shipment_code ?? item.code ?? item.reference ?? `SHP-${24811 + index}`,
    supplier: item.supplier_name ?? item.supplier ?? item.vendor_name ?? 'Unknown supplier',
    created: item.created_at ?? item.created_on ?? item.created ?? new Date().toISOString(),
    status: String(item.status ?? item.processing_status ?? 'ingested').toLowerCase(),
    documents: Array.isArray(item.documents) ? item.documents : [],
    document_count: item.document_count ?? item.documentCount ?? item.documents_count ?? (Array.isArray(item.documents) ? item.documents.length : 0),
    raw: item,
  }
}

export function normalizeField(item, index = 0) {
  const rawConfidence = item.confidence_score ?? item.confidence ?? item.score ?? 0.9
  const confidence = Number(rawConfidence) <= 1 ? Number(rawConfidence) * 100 : Number(rawConfidence)
  return {
    id: item.id ?? item.field_id ?? item.pk ?? `field-${index}`,
    key: item.field_key ?? item.key ?? item.field_name ?? item.name ?? `field_${index}`,
    label: item.field_label ?? item.label ?? humanize(item.field_name ?? item.key ?? `field ${index + 1}`),
    value: item.field_value ?? item.value ?? item.extracted_value ?? '',
    confidence: Number.isFinite(confidence) ? confidence : 0,
    verified: Boolean(item.is_human_verified ?? item.human_verified ?? item.verified),
    category: (item.category ?? item.group ?? item.document_type ?? item.doc_type ?? 'invoice').toLowerCase(),
    page: Number(item.page_number ?? item.page ?? 1),
    bbox: normalizeBbox(item.bounding_box ?? item.bbox ?? item.coordinates),
    raw: item,
  }
}

export function normalizeBbox(bbox) {
  if (!bbox) return null
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [x, y, w, h] = bbox.map(Number)
    return { x, y, w, h }
  }
  const x = Number(bbox.x ?? bbox.left ?? bbox.x1 ?? bbox.x0)
  const y = Number(bbox.y ?? bbox.top ?? bbox.y1 ?? bbox.y0)
  const w = Number(bbox.width ?? bbox.w ?? (bbox.x2 != null ? Number(bbox.x2) - x : NaN))
  const h = Number(bbox.height ?? bbox.h ?? (bbox.y2 != null ? Number(bbox.y2) - y : NaN))
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, w, h }
}

export function normalizeCheck(item, index = 0) {
  const rawStatus = String(item.status ?? (item.passed ?? item.is_passed ? 'passed' : 'failed')).toLowerCase()
  const status = /pass|success|valid|clear/.test(rawStatus) ? 'passed' : /fail|mismatch|error|block|pending|review/.test(rawStatus) ? 'failed' : rawStatus
  return {
    id: item.id ?? item.check_id ?? `check-${index}`,
    title: item.rule_name ?? item.name ?? item.check_name ?? item.title ?? `Cross-check ${index + 1}`,
    message: item.message ?? item.description ?? item.discrepancy ?? 'Review this cross-check result.',
    status,
    overridden: Boolean(item.is_overridden ?? item.overridden),
    raw: item,
  }
}

export const roleLabel = (role = 'executive') => ({ super_admin: 'Super Admin', manager: 'Manager', executive: 'Executive' }[role] || humanize(role))
