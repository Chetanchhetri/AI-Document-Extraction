import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CloudUpload } from 'lucide-react';
import { api } from '../api.js';
import { arr, DOC_TYPES } from '../normalize.js';
import { activeShipment } from '../store.js';
import { Badge, Empty, PageHead, label, useToast } from '../ui.jsx';

const MAX = 25 * 1024 * 1024;
const busyState = (d) => /pending|process|queue/i.test(d.extraction_status || '');
export default function Intake() {
  const toast = useToast(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const sid = sp.get('shipment') || activeShipment.get();
  const [ships, setShips] = useState([]); const [docs, setDocs] = useState([]); const [queue, setQueue] = useState([]); const [busy, setBusy] = useState(false);
  const input = useRef();
  useEffect(() => { api.shipments({ limit: 100 }).then((r) => setShips(arr(r))).catch((e) => toast(e.message, 'err')); }, [toast]);
  useEffect(() => { activeShipment.set(sid); }, [sid]);
  const loadDocs = useCallback(async () => { if (!sid) return setDocs([]); try { setDocs(arr(await api.docs(sid))); } catch (e) { toast(e.message, 'err'); } }, [sid, toast]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => { if (!docs.some(busyState)) return undefined; const i = setInterval(loadDocs, 3000); return () => clearInterval(i); }, [docs, loadDocs]);
  const have = (k) => docs.find((d) => d.doc_type === k);
  const sel = ships.find((s) => String(s.id) === String(sid));
  const locked = sel?.status === 'exported';
  const add = (files) => {
    const taken = new Set(queue.map((q) => q.type)); const missing = DOC_TYPES.filter((t) => !have(t.key) && !taken.has(t.key)).map((t) => t.key); const next = [];
    [...files].forEach((f) => {
      if (f.size > MAX) return toast(`${f.name} is over 25 MB.`, 'err');
      if (!/pdf|image/.test(f.type)) return toast(`${f.name} is not a PDF or image.`, 'err');
      next.push({ file: f, type: missing.shift() || 'invoice' });
    });
    setQueue((q) => [...q, ...next]);
  };
  const upload = async () => {
    setBusy(true);
    for (const item of queue) {
      try { await api.uploadDoc(sid, item.type, item.file, !!have(item.type)); toast(`${item.file.name} uploaded as ${label(item.type)}. Extraction started.`); setQueue((q) => q.filter((x) => x !== item)); }
      catch (e) { toast(`${item.file.name}: ${e.message}`, 'err'); }
    }
    setBusy(false); loadDocs();
  };
  return (
    <>
      <PageHead title="Document upload center" sub="Upload the customs triad: PDF or image files up to 25 MB.">
        {sid && <button className="ghost" onClick={() => nav('/review/' + sid)}>Open review workspace</button>}</PageHead>
      <div className="card row between pad">
        <div><small className="mut">Active shipment</small><div className="row">{sel ? <><b className="mono">{sel.shipment_code}</b><Badge status={sel.status} /><span className="mut">{sel.supplier_name}</span></> : <span className="mut">Choose a shipment to begin</span>}</div></div>
        <select value={sid} onChange={(e) => { setSp(e.target.value ? { shipment: e.target.value } : {}); setQueue([]); }} aria-label="Choose shipment"><option value="">Choose shipment…</option>{ships.map((s) => <option key={s.id} value={s.id}>{s.shipment_code} · {s.supplier_name}</option>)}</select>
      </div>
      {!sid ? <Empty title="No shipment selected" hint="Pick a shipment above, or create one from the Shipments page." /> : locked ? <Empty title="This shipment is exported" hint="Documents are locked after export." /> : (
        <div className="split">
          <div className="card pad">
            <h3>Drop documents to ingest</h3>
            <div className="drop" onClick={() => input.current.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
              <CloudUpload size={26} /><b>Drag and drop files here</b><span className="mut">or browse from your device. PDF, PNG or JPG.</span>
              <input ref={input} type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </div>
            {queue.map((q, i) => (
              <div className="row between qrow" key={i}><span>{q.file.name}<small className="mut"> · {(q.file.size / 1048576).toFixed(1)} MB{have(q.type) ? ' · replaces current file' : ''}</small></span>
                <span className="row"><select value={q.type} onChange={(e) => setQueue(queue.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>{DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
                  <button className="ghost" onClick={() => setQueue(queue.filter((_, j) => j !== i))}>Remove</button></span></div>))}
            {queue.length > 0 && <button className="primary wide" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : `Upload ${queue.length} file${queue.length > 1 ? 's' : ''}`}</button>}
          </div>
          <div className="card pad">
            <h3>Document triad checklist</h3>
            {DOC_TYPES.map((t) => { const d = have(t.key); return (
              <div className="row between check" key={t.key}><span className="row nowrap"><i className={'tick ' + (d ? 'on' : '')}>{d && <Check size={12} />}</i><span><b>{t.label}</b><small className="mut block">{d ? `${d.file_name} · ${d.page_count ?? 1} page${d.page_count > 1 ? 's' : ''}` : 'Not uploaded yet'}</small></span></span>
                {d ? <Badge status={/fail/i.test(d.extraction_status) ? 'failed' : busyState(d) ? 'processing' : 'approved'}>{label(d.extraction_status)}</Badge> : <Badge status="needs_review">Missing</Badge>}</div>); })}
            <p className="mut small">Uploading a type that already exists replaces it and re-runs extraction.</p>
          </div>
        </div>)}
    </>
  );
}
