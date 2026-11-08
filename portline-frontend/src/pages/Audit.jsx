import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { arr, fmtDate } from '../normalize.js';
import { Empty, PageHead, useToast } from '../ui.jsx';

export default function Audit() {
  const toast = useToast(); const { isManager } = useAuth();
  const [acc, setAcc] = useState(null); const [logs, setLogs] = useState([]); const [logMsg, setLogMsg] = useState('');
  const load = useCallback(() => {
    if (!isManager) return;
    api.accuracy().then(setAcc).catch((e) => toast(e.message, 'err'));
    api.auditLogs(0, 100).then((r) => { setLogs(arr(r)); setLogMsg(''); }).catch((e) => setLogMsg(e.status === 404 || e.status === 405 ? 'This backend does not expose an audit log endpoint yet (GET /api/v1/analytics/audit-logs).' : e.message));
  }, [toast, isManager]);
  useEffect(() => { load(); }, [load]);
  if (!isManager) return <Empty title="Managers only" hint="Accuracy analytics and audit logs are visible to managers and super admins." />;
  const fields = (acc?.by_field ?? []).filter((r) => r.accuracy_rate_pct != null);
  const suppliers = acc?.by_supplier ?? []; const o = acc?.overall;
  return (
    <>
      <PageHead title="Analytics & audit" sub="Extraction quality, supplier discrepancy trends and operator activity.">
        <button className="ghost" onClick={load}><RefreshCw size={14} />Refresh metrics</button></PageHead>
      <div className="stats">
        <div className="card stat"><small>Overall extraction accuracy</small><b className="mono">{o?.accuracy_rate_pct != null ? o.accuracy_rate_pct.toFixed(1) + '%' : '–'}</b><span>Fields verified without edits</span></div>
        <div className="card stat"><small>Total fields</small><b className="mono">{o?.total_fields ?? '–'}</b><span>Extracted by AI</span></div>
        <div className="card stat"><small>Verified clean</small><b className="mono">{o?.verified_without_edits ?? '–'}</b><span>Accepted without changes</span></div>
        <div className="card stat"><small>Suppliers tracked</small><b className="mono">{suppliers.length}</b><span>With extraction history</span></div></div>
      <div className="split">
        <div className="card pad"><h3>Field extraction accuracy</h3>
          {fields.length === 0 ? <Empty title="No field metrics yet" hint="Accuracy appears once operators verify extracted fields." /> : <div className="bars">{fields.map((r) => <div key={r.field_name} title={`${r.verified_without_edits} of ${r.total_extracted} fields verified without edits`}><span>{r.field_name.replace(/_/g, ' ')}</span><div className="track"><div style={{ width: r.accuracy_rate_pct + '%' }} /></div><b className="mono">{r.accuracy_rate_pct.toFixed(0)}%</b></div>)}</div>}</div>
        <div className="card pad"><h3>Supplier discrepancy volume</h3>
          {suppliers.length === 0 ? <Empty title="No supplier metrics yet" hint="Discrepancies are grouped by supplier after cross-checks run." /> : <div className="scroll"><table><thead><tr><th>Supplier</th><th>Error rate</th><th>Weight</th><th>Packages</th><th>Checks</th></tr></thead>
            <tbody>{suppliers.map((s) => <tr key={s.supplier_name}><td>{s.supplier_name}<small className="mut block">{s.shipments} shipment{s.shipments === 1 ? '' : 's'}</small></td><td className="mono">{s.field_error_rate_pct}%</td><td className="mono">{s.weight_mismatches}</td><td className="mono">{s.package_mismatches}</td><td className="mono">{s.failed_or_overridden_checks}</td></tr>)}</tbody></table></div>}</div>
      </div>
      <div className="card pad"><h3>Activity stream</h3>
        {logMsg ? <p className="mut">{logMsg}</p> : logs.length === 0 ? <Empty title="No audit events yet" hint="Field edits, verifications and overrides are recorded here." /> : (
          <div className="scroll"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Previous</th><th>New</th></tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id}><td className="mut">{fmtDate(l.created_at ?? l.timestamp)}</td><td>{l.user_email ?? l.user_name ?? `#${l.user_id}`}</td><td className="mono">{l.action}{l.shipment_id ? <small className="mut"> · SHP #{l.shipment_id}</small> : null}</td><td className="mono mut">{String(l.previous_value ?? l.previous ?? '–')}</td><td className="mono">{String(l.new_value ?? l.new ?? '–')}</td></tr>)}</tbody></table></div>)}
      </div>
    </>
  );
}
