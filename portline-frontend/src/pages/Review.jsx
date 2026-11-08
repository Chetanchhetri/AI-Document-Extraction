import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Check, CheckCheck, Download, Pencil, Sparkles } from 'lucide-react';
import { api, saveBlob } from '../api.js';
import { arr, DOC_TYPES, normReview } from '../normalize.js';
import { activeShipment } from '../store.js';
import { useAuth } from '../auth.jsx';
import DocView from '../DocView.jsx';
import { Badge, Empty, Modal, PageHead, label, useToast } from '../ui.jsx';

function Source({ doc, data, fields, activeId, page, setPage, onPick }) {
  const [blob, setBlob] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { if (!doc) return; setBlob(null); setErr(''); api.docFile(doc.id).then((r) => setBlob(r.blob)).catch((e) => setErr(e.message)); }, [doc]);
  if (!doc) return <Empty title="No documents yet" hint="Upload the invoice, packing list and bill of lading from Document intake." />;
  if (err) return <p className="mut pad">{err}</p>;
  if (!blob) return <div className="skeleton" />;
  return <DocView blob={blob} dpi={data.dpi} fields={fields} activeId={activeId} page={page} onPage={setPage} onPick={onPick} />;
}

function Hsn({ initial, onClose }) {
  const [q, setQ] = useState(initial || ''); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const toast = useToast();
  const go = async (e) => { e?.preventDefault(); setBusy(true); try { setRes(arr(await api.hsn(q))); } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); } };
  useEffect(() => { if (initial) go(); /* eslint-disable-next-line */ }, []);
  return (
    <Modal title="HSN code suggestions" onClose={onClose}>
      <form onSubmit={go} className="row nowrap"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="LED panel light 40W ceiling fixture" required /><button className="primary" disabled={busy}>{busy ? 'Matching…' : 'Suggest'}</button></form>
      <p className="mut small">Matches come from line items of approved or exported shipments, so results grow as more shipments are verified.</p>
      {res && (res.length === 0 ? <p className="mut">No close matches yet.</p> : res.map((r) => (
        <div className="row between check" key={r.hsn_code}><span><b className="mono">{r.hsn_code}</b><small className="mut block">{r.matched_description} · seen in {r.shipment_code}{r.occurrences > 1 ? ` (+${r.occurrences - 1} more)` : ''}</small></span><Badge status="approved">{Math.round(r.score * 100)}% match</Badge></div>)))}
    </Modal>
  );
}

export default function Review() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast(); const { isManager } = useAuth();
  const [ships, setShips] = useState([]); const [data, setData] = useState(null); const [tab, setTab] = useState('invoice');
  const [docId, setDocId] = useState(null); const [page, setPage] = useState(1); const [active, setActive] = useState(null);
  const [edit, setEdit] = useState(null); const [ov, setOv] = useState(null); const [hsn, setHsn] = useState(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(normReview(await api.review(id))); activeShipment.set(id); }
    catch (e) { toast(e.message, 'err'); if (e.status === 404) { activeShipment.set(''); nav('/review', { replace: true }); } }
  }, [id, toast, nav]);
  useEffect(() => { if (!id) { api.shipments({ limit: 100 }).then((r) => setShips(arr(r))).catch((e) => toast(e.message, 'err')); } else { setData(null); load(); } }, [id, load, toast]);
  const doc = useMemo(() => data?.docs.find((d) => d.id === docId) ?? data?.docs.find((d) => d.doc_type === tab) ?? data?.docs[0], [data, docId, tab]);

  if (!id) {
    const last = activeShipment.get();
    if (last) return <Navigate to={'/review/' + last} replace />;
    return (<><PageHead title="Review workspace" sub="Pick a shipment to compare its documents with the extracted data." />
      <div className="card">{ships.length === 0 ? <Empty title="No shipments to review" /> : <table><tbody>{ships.map((s) => <tr key={s.id} className="hover" onClick={() => nav('/review/' + s.id)}><td className="mono link">{s.shipment_code}</td><td>{s.supplier_name}</td><td><Badge status={s.status} /></td></tr>)}</tbody></table>}</div></>);
  }
  if (!data) return <div className="skeleton tall" />;

  const sh = data.shipment; const locked = sh.status === 'exported';
  const inTab = data.fields.filter((f) => f.docType === tab);
  const lowOpen = data.fields.filter((f) => f.low && !f.verified).length;
  const failed = data.checks.filter((c) => c.failed).length;
  const pick = (f) => { setActive(f.id); setTab(f.docType); setDocId(f.docId); if (f.bbox?.page) setPage(f.bbox.page); };
  const save = async (f, value) => { try { await api.patchField(id, f.id, value); toast(`${f.name.replace(/_/g, ' ')} verified.`); setEdit(null); load(); } catch (e) { toast(e.message, 'err'); } };
  const verifyAll = async () => { setBusy(true); try { const r = await api.verifyAll(id); toast(r?.message || 'All fields verified.'); load(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const override = async (e) => { e.preventDefault(); try { await api.override(id, ov.check.id, ov.reason); toast('Mismatch overridden and logged.'); setOv(null); load(); } catch (err) { toast(err.message, 'err'); } };
  const exp = async () => { try { const { blob, filename } = await api.exportXlsx(id); saveBlob(blob, filename || `${sh.shipment_code || 'shipment'}.xlsx`); toast('Customs filing downloaded.'); load(); } catch (e) { toast(e.status === 422 ? `Export blocked: ${e.message}` : e.message, 'err'); } };
  const tabs = [...DOC_TYPES.map((t) => ({ key: t.key, name: t.label, n: data.fields.filter((f) => f.docType === t.key).length })), { key: 'lines', name: 'Line items', n: data.lines.length }, { key: 'checks', name: 'Cross-checks', n: data.checks.length }];
  const cols = data.lines[0] ? Object.keys(data.lines[0]).filter((k) => !/(^id$|_id$|embedding|created|updated)/.test(k)).slice(0, 6) : [];
  return (
    <>
      <PageHead title={sh.shipment_code ?? `Shipment ${id}`} sub={`${sh.supplier_name ?? ''} · side-by-side verification`}>
        {sh.status && <Badge status={sh.status} />}
        <button className="ghost" onClick={() => setHsn('')}><Sparkles size={14} />HSN lookup</button>
        {!locked && <button className="ghost" disabled={busy || lowOpen + data.fields.filter((f) => !f.verified).length === 0} onClick={verifyAll}><CheckCheck size={14} />Verify all</button>}
        <button className="primary" onClick={exp}><Download size={14} />Export filing</button></PageHead>
      {!data.ready && data.blockers.length > 0 && <div className="banner"><AlertTriangle size={16} /><div><b>Export is blocked until these are resolved</b><ul>{data.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></div></div>}
      <div className="stats"><div className="card stat"><small>Extracted fields</small><b className="mono">{data.fields.length}</b></div>
        <div className="card stat"><small>Low confidence open</small><b className="mono">{String(lowOpen).padStart(2, '0')}</b><span>{lowOpen ? 'Verify before export' : 'All clear'}</span></div>
        <div className="card stat"><small>Cross-check issues</small><b className="mono">{String(failed).padStart(2, '0')}</b><span>{failed ? 'Fix values or override' : 'None open'}</span></div>
        <div className="card stat"><small>Documents</small><b className="mono">{data.docs.length} / 3</b><span>{data.ready ? 'Ready for export' : 'Not export-ready'}</span></div></div>
      <div className="split wide-left">
        <div className="card pad">
          <div className="row between"><h3>Document source</h3><div className="chips">{data.docs.map((d) => <button key={d.id} className={doc?.id === d.id ? 'on' : ''} onClick={() => { setDocId(d.id); setTab(d.doc_type); setPage(1); }}>{label(d.doc_type)}</button>)}</div></div>
          {doc && /fail/i.test(doc.extraction_status || '') && <p className="mut">Extraction failed for this document. Re-upload it from Document intake.</p>}
          <Source doc={doc} data={data} fields={data.fields.filter((f) => f.docId === doc?.id)} activeId={active} page={page} setPage={setPage} onPick={pick} />
        </div>
        <div className="card pad">
          <h3>Extracted data</h3>
          <div className="tabs">{tabs.map((t) => <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setTab(t.key); setDocId(null); setPage(1); }}>{t.name}<i>{t.n}</i></button>)}</div>
          {DOC_TYPES.some((t) => t.key === tab) && (inTab.length === 0 ? <Empty title="No fields extracted" hint="Extraction may still be running. Refresh in a moment." /> : inTab.map((f) => (
            <div key={f.id} className={'field ' + (f.low && !f.verified ? 'low ' : '') + (active === f.id ? 'sel' : '')} onClick={() => pick(f)}>
              <div className="row between"><small className="mut">{f.name.replace(/_/g, ' ')}</small>{f.verified ? <Badge status="approved">Human verified</Badge> : f.low ? <Badge status="needs_review">Needs verification</Badge> : <Badge status="ingested">AI extracted</Badge>}</div>
              {edit?.id === f.id ? (
                <form className="row nowrap" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); save(f, edit.value); }}><input autoFocus value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} className="mono" /><button className="primary">Save</button><button type="button" className="ghost" onClick={() => setEdit(null)}>Cancel</button></form>
              ) : (
                <div className="row between"><b className="mono">{String(f.value) || '—'}</b>
                  <span className="row nowrap" onClick={(e) => e.stopPropagation()}>{f.conf != null && <span className="conf" title={`${f.conf.toFixed(0)}% confidence`}><i style={{ width: f.conf + '%' }} /></span>}
                    {!locked && <button className="icon" title="Edit value" onClick={() => setEdit({ id: f.id, value: String(f.value) })}><Pencil size={14} /></button>}
                    {!locked && !f.verified && String(f.value).trim() && <button className="icon" title="Confirm value is correct" onClick={() => save(f, String(f.value))}><Check size={14} /></button>}</span></div>)}
            </div>)))}
          {tab === 'lines' && (data.lines.length === 0 ? <Empty title="No line items extracted" hint="Line items come from the invoice." /> : <div className="scroll"><table><thead><tr>{cols.map((k) => <th key={k}>{k.replace(/_/g, ' ')}</th>)}<th /></tr></thead>
            <tbody>{data.lines.map((l) => <tr key={l.id}>{cols.map((k) => <td key={k} className="mono">{typeof l[k] === 'object' ? JSON.stringify(l[k]) : String(l[k] ?? '')}</td>)}<td><button className="ghost" onClick={() => setHsn(l.item_description ?? '')}>Suggest HSN</button></td></tr>)}</tbody></table></div>)}
          {tab === 'checks' && (data.checks.length === 0 ? <Empty title="No cross-checks yet" hint="They run once documents are extracted." /> : data.checks.map((c) => (
            <div key={c.id} className={'field ' + (c.failed ? 'low' : '')}>
              <div className="row between"><b>{label(c.rule.toLowerCase())}</b>{c.over ? <Badge status="exported">Overridden</Badge> : c.failed ? <Badge status="needs_review">Mismatch</Badge> : <Badge status="approved">Passed</Badge>}</div>
              {c.msg && <p className="mut">{c.msg}</p>}
              {(c.expected != null || c.actual != null) && <p className="mono mut">expected {String(c.expected ?? '–')} · found {String(c.actual ?? '–')}</p>}
              {c.reason && <p className="mut">Override reason: {c.reason}</p>}
              {c.failed && !locked && (isManager ? <button className="ghost" onClick={() => setOv({ check: c, reason: '' })}>Override mismatch</button> : <small className="mut">Correct the field values, or ask a manager to override.</small>)}
            </div>)))}
        </div>
      </div>
      {ov && <Modal title={`Override: ${label(ov.check.rule.toLowerCase())}`} onClose={() => setOv(null)}><form onSubmit={override}>
        <label>Justification (saved to the audit log)<textarea required minLength={5} rows={4} value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="Explain why this mismatch is acceptable." /></label>
        <button className="primary wide">Override and log</button></form></Modal>}
      {hsn !== null && <Hsn initial={hsn} onClose={() => setHsn(null)} />}
    </>
  );
}
