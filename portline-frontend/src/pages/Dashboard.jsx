import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, saveBlob } from '../api.js';
import { arr, fmtDate, STATUSES } from '../normalize.js';
import { activeShipment } from '../store.js';
import { useAuth } from '../auth.jsx';
import { Badge, Empty, Modal, PageHead, label, useToast } from '../ui.jsx';

export default function Dashboard() {
  const nav = useNavigate(); const toast = useToast(); const { isManager } = useAuth(); const [sp] = useSearchParams();
  const q = (sp.get('q') || '').toLowerCase();
  const [all, setAll] = useState([]); const [rows, setRows] = useState([]); const [tab, setTab] = useState('all'); const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true); const [open, setOpen] = useState(false); const [del, setDel] = useState(null); const [supplier, setSupplier] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = arr(await api.shipments({ limit: 200 })); setAll(a);
      setRows(tab === 'all' ? a : arr(await api.shipments({ status: tab, limit: 200 })));
      Promise.allSettled(a.slice(0, 50).map((s) => api.docs(s.id).then((d) => [s.id, arr(d).length]))).then((r) => setCounts(Object.fromEntries(r.filter((x) => x.status === 'fulfilled').map((x) => x.value))));
    } catch (e) { toast(e.message, 'err'); } finally { setLoading(false); }
  }, [tab, toast]);
  useEffect(() => { load(); }, [load]);
  const count = (s) => all.filter((x) => x.status === s).length;
  const shown = rows.filter((s) => !q || `${s.shipment_code} ${s.supplier_name}`.toLowerCase().includes(q));
  const go = (path, s) => { activeShipment.set(s.id); nav(path); };
  const create = async (e) => {
    e.preventDefault();
    try { const s = await api.createShipment(supplier.trim()); toast(`${s?.shipment_code ?? 'Shipment'} created. Upload its documents next.`); setOpen(false); setSupplier(''); if (s?.id) go('/intake?shipment=' + s.id, s); else load(); }
    catch (err) { toast(err.message, 'err'); }
  };
  const remove = async () => { try { await api.deleteShipment(del.id); if (String(activeShipment.get()) === String(del.id)) activeShipment.set(''); toast(`Deleted ${del.shipment_code}.`); setDel(null); load(); } catch (e) { toast(e.message, 'err'); } };
  const exp = async (s) => { try { const { blob, filename } = await api.exportXlsx(s.id); saveBlob(blob, filename || `${s.shipment_code}.xlsx`); toast('Customs filing downloaded.'); load(); } catch (e) { toast(e.status === 422 ? `Export blocked: ${e.message}` : e.message, 'err'); } };
  const stats = [['Total shipments', all.length, 'In this workspace'], ['Pending review', count('needs_review'), 'Need an operator'], ['Approved', count('approved'), 'Ready for export'], ['Exported', count('exported'), 'Customs filing generated']];
  return (
    <>
      <PageHead title="Shipments" sub="Operational overview of your customs document pipeline.">
        <button className="ghost" onClick={load}><RefreshCw size={14} />Refresh</button>
        <button className="primary" onClick={() => setOpen(true)}><Plus size={14} />New shipment</button></PageHead>
      <div className="stats">{stats.map(([n, v, h]) => <div className="card stat" key={n}><small>{n}</small><b className="mono">{String(v).padStart(2, '0')}</b><span>{h}</span></div>)}</div>
      <div className="card">
        <div className="tabs">{['all', ...STATUSES].map((s) => <button key={s} className={tab === s ? 'on' : ''} onClick={() => setTab(s)}>{label(s)}<i>{s === 'all' ? all.length : count(s)}</i></button>)}</div>
        {loading && !rows.length ? <div className="skeleton tall" /> : shown.length === 0 ? (
          <Empty title={q ? 'No shipments match your search' : 'No shipments here yet'} hint="Create a shipment, then upload its invoice, packing list and bill of lading."><button className="primary" onClick={() => setOpen(true)}>New shipment</button></Empty>
        ) : (
          <div className="scroll"><table><thead><tr><th>Reference</th><th>Supplier</th><th>Created</th><th>Documents</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id}>
                <td className="mono link" onClick={() => go('/review/' + s.id, s)}>{s.shipment_code}</td>
                <td>{s.supplier_name}</td><td className="mut">{fmtDate(s.created_at)}</td>
                <td><span className="dots" title={`${counts[s.id] ?? '?'} of 3 documents`}>{[0, 1, 2].map((i) => <i key={i} className={i < (counts[s.id] ?? 0) ? 'on' : ''} />)}</span></td>
                <td><Badge status={s.status} /></td>
                <td className="acts">
                  <button className="ghost" onClick={() => go('/review/' + s.id, s)}>Review</button>
                  <button className="ghost" onClick={() => go('/intake?shipment=' + s.id, s)}>Upload</button>
                  <button className="icon" title="Download customs filing" onClick={() => exp(s)}><Download size={15} /></button>
                  {isManager && <button className="icon danger" title="Delete shipment" onClick={() => setDel(s)}><Trash2 size={15} /></button>}
                </td>
              </tr>))}</tbody></table></div>
        )}
      </div>
      {open && <Modal title="New shipment" onClose={() => setOpen(false)}>
        <form onSubmit={create}>
          <label>Supplier name<input required autoFocus value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Company B (China)" /></label>
          <p className="mut small">The shipment code (for example SHP-24814) is assigned automatically.</p>
          <button className="primary wide">Create shipment</button>
        </form></Modal>}
      {del && <Modal title="Delete shipment" onClose={() => setDel(null)}>
        <p>Delete <b>{del.shipment_code}</b> with all its documents and extracted fields? This cannot be undone.</p>
        <div className="row end"><button className="ghost" onClick={() => setDel(null)}>Keep shipment</button><button className="primary danger" onClick={remove}>Delete shipment</button></div></Modal>}
    </>
  );
}
