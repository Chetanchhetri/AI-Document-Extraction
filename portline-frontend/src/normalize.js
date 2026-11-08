// Shapes below follow the backend routers (review.py, analytics.py, documents.py).
export const arr = (x) => Array.isArray(x) ? x : x?.items ?? x?.data ?? x?.results ?? [];
export const DOC_TYPES = [
  { key: 'invoice', label: 'Invoice' },
  { key: 'packing_list', label: 'Packing List' },
  { key: 'bill_of_lading', label: 'Bill of Lading' },
];
export const STATUSES = ['ingested', 'processing', 'needs_review', 'approved', 'exported'];
export const pct = (c) => (c == null ? null : c <= 1 ? c * 100 : c);
const bboxOf = (f) => {
  const b = f.bbox ?? f.bounding_box ?? (f.x != null ? { x: f.x, y: f.y, w: f.w, h: f.h, page: f.page } : null);
  if (!b) return null;
  if (Array.isArray(b)) return { x: b[0], y: b[1], w: b[2], h: b[3], page: b[4] ?? f.page ?? 1 };
  return b.w != null ? { page: 1, ...b } : null;
};
export const fieldOf = (f) => {
  const conf = pct(f.confidence ?? f.confidence_score ?? f.ocr_confidence);
  return {
    id: f.id, name: f.field_name ?? f.name ?? 'field', value: f.field_value ?? f.value ?? '',
    conf, verified: !!f.is_human_verified,
    low: f.is_low_confidence ?? f.low_confidence ?? f.needs_review ?? (conf != null && conf < 85),
    docType: f.doc_type, docId: f.document_id, bbox: bboxOf(f),
  };
};
export function normReview(p) {
  p = p || {};
  const entries = arr(p.documents);
  const docs = entries.map((e) => e.document ?? e);
  const fields = entries.flatMap((e) => { const d = e.document ?? e; return arr(e.fields).map((f) => fieldOf({ document_id: d.id, doc_type: d.doc_type, ...f })); });
  return {
    shipment: p.shipment ?? {}, docs, fields, dpi: p.bbox_reference?.render_dpi ?? 200,
    lines: arr(p.line_items),
    ready: !!p.export_ready,
    blockers: arr(p.export_blockers).map((b) => (typeof b === 'string' ? b : b.message ?? b.detail ?? JSON.stringify(b))),
    checks: arr(p.cross_checks).map((c) => {
      const st = String(c.status ?? '').toLowerCase();
      return {
        id: c.id, rule: c.check_name ?? c.rule_name ?? 'check', status: st, over: st === 'overridden', failed: st === 'failed',
        msg: c.message ?? c.details ?? c.detail ?? c.description ?? '', expected: c.expected_value ?? c.expected, actual: c.actual_value ?? c.actual, reason: c.override_reason,
      };
    }),
  };
}
export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
