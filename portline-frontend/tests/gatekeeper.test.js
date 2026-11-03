import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateGatekeeper } from '../src/lib/gatekeeper.js'

const triad = [
  { doc_type: 'invoice' },
  { doc_type: 'packing_list' },
  { doc_type: 'bill_of_lading' },
]

test('allows export only when triad, confidence and cross-checks are clear', () => {
  const result = evaluateGatekeeper({
    documents: triad,
    fields: [{ key: 'invoice_number', label: 'Invoice number', confidence: 99, verified: true }],
    checks: [{ title: 'Invoice arithmetic', status: 'passed', overridden: false }],
  })
  assert.equal(result.canExport, true)
  assert.deepEqual(result.blockers, [])
})

test('blocks export when a low-confidence field has not been verified', () => {
  const result = evaluateGatekeeper({
    documents: triad,
    fields: [{ key: 'incoterms', label: 'Incoterms', confidence: 84, verified: false }],
    checks: [],
  })
  assert.equal(result.canExport, false)
  assert.match(result.blockers.join(' '), /Incoterms.*human verification/)
})

test('blocks export for failed checks until a manager override is recorded', () => {
  const failed = { title: 'Gross weight reconciliation', message: 'Weight variance: 45 kg', status: 'failed', overridden: false }
  assert.equal(evaluateGatekeeper({ documents: triad, checks: [failed] }).canExport, false)
  assert.equal(evaluateGatekeeper({ documents: triad, checks: [{ ...failed, overridden: true }] }).canExport, true)
})

test('blocks export when any document in the triad is missing', () => {
  const result = evaluateGatekeeper({ documents: triad.slice(0, 2), checks: [], fields: [] })
  assert.equal(result.canExport, false)
  assert.deepEqual(result.missingDocuments.map((doc) => doc.key), ['bill_of_lading'])
})

test('recognizes common Bill of Lading aliases', () => {
  const result = evaluateGatekeeper({
    documents: [{ doc_type: 'invoice' }, { doc_type: 'packing list' }, { doc_type: 'BOL' }],
  })
  assert.equal(result.missingDocuments.length, 0)
})
