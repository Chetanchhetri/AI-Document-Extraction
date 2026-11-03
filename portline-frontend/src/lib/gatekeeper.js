const REQUIRED_DOCUMENTS = [
  { key: 'invoice', label: 'Invoice' },
  { key: 'packing_list', label: 'Packing List' },
  { key: 'bill_of_lading', label: 'Bill of Lading' },
]

const FAILED_STATUSES = new Set(['failed', 'error', 'blocked', 'needs_review', 'pending', 'mismatch'])

function normalizeDocumentType(value = '') {
  const type = String(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (type === 'bol' || type.includes('lading')) return 'bill_of_lading'
  if (type.includes('packing')) return 'packing_list'
  if (type.includes('invoice')) return 'invoice'
  return type
}

/**
 * Evaluate the client-side export gate using the documented review payload.
 * Cross-document arithmetic and reconciliation remain owned by the extraction API;
 * this function only enforces returned check states, low-confidence confirmation,
 * and presence of the required source-document triad.
 */
export function evaluateGatekeeper({ fields = [], checks = [], documents = [] } = {}) {
  const lowConfidenceFields = fields.filter((field) => Number(field.confidence) < 85 && !field.verified)
  const unresolvedChecks = checks.filter((check) => {
    const status = String(check.status || '').toLowerCase()
    return FAILED_STATUSES.has(status) && !check.overridden
  })

  const presentTypes = new Set(documents.map((doc) => normalizeDocumentType(doc.doc_type ?? doc.document_type ?? doc.type)))
  const missingDocuments = REQUIRED_DOCUMENTS.filter((document) => !presentTypes.has(document.key))

  const blockers = [
    ...missingDocuments.map((document) => `Required source document missing: ${document.label}`),
    ...lowConfidenceFields.map((field) => `Field "${field.label || field.key || 'Unknown field'}" needs human verification`),
    ...unresolvedChecks.map((check) => check.message || `${check.title || 'Cross-check'} failed`),
  ]

  return {
    canExport: blockers.length === 0,
    blockers,
    lowConfidenceFields,
    unresolvedChecks,
    missingDocuments,
  }
}
