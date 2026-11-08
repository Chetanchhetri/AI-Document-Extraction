import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
pdfjs.GlobalWorkerOptions.workerSrc = worker;

// Renders a PDF page or image and overlays field bounding boxes.
// bbox unit: pixels at `dpi`, top-left origin, 1-based page (see bbox_reference in the review payload).
export default function DocView({ blob, dpi, fields, activeId, page, onPage, onPick }) {
  const wrap = useRef(); const cv = useRef();
  const [pdf, setPdf] = useState(null); const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1); const [scale, setScale] = useState(1); const [err, setErr] = useState('');
  const isImg = blob.type.startsWith('image/');
  useEffect(() => {
    let dead = false; let url; let doc; setErr(''); setPdf(null); setImg(null);
    if (isImg) { url = URL.createObjectURL(blob); const i = new Image(); i.onload = () => !dead && setImg(i); i.src = url; }
    else blob.arrayBuffer().then((b) => pdfjs.getDocument({ data: b }).promise).then((d) => { doc = d; if (!dead) setPdf(d); }).catch((e) => setErr('Could not render this PDF: ' + e.message));
    return () => { dead = true; if (url) URL.revokeObjectURL(url); doc?.destroy(); };
  }, [blob, isImg]);
  useEffect(() => {
    if (!pdf && !img) return undefined;
    let dead = false; let task;
    (async () => {
      const W = (wrap.current?.clientWidth || 600) * zoom; const dpr = window.devicePixelRatio || 1; const c = cv.current;
      if (img) {
        const s = W / img.naturalWidth; c.width = W * dpr; c.height = img.naturalHeight * s * dpr;
        c.style.width = W + 'px'; c.style.height = img.naturalHeight * s + 'px';
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); setScale(s); return;
      }
      const pg = await pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages));
      const s = W / pg.getViewport({ scale: 1 }).width; const v = pg.getViewport({ scale: s * dpr });
      if (dead) return;
      c.width = v.width; c.height = v.height; c.style.width = v.width / dpr + 'px'; c.style.height = v.height / dpr + 'px';
      task = pg.render({ canvasContext: c.getContext('2d'), viewport: v }); await task.promise; if (!dead) setScale(s);
    })().catch((e) => { if (e?.name !== 'RenderingCancelledException') setErr(e.message); });
    return () => { dead = true; task?.cancel(); };
  }, [pdf, img, page, zoom]);
  const pages = pdf?.numPages ?? 1;
  const k = isImg ? scale : (scale * 72) / dpr_(dpi);
  const boxes = fields.filter((f) => f.bbox && (f.bbox.page ?? 1) === (isImg ? 1 : page));
  return (
    <div>
      <div className="vtools">
        <button className="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="mono">{page} / {pages}</span>
        <button className="icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        <span className="grow" />
        <button className="icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out"><Minus size={16} /></button>
        <span className="mono">{Math.round(zoom * 100)}%</span>
        <button className="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in"><Plus size={16} /></button>
      </div>
      {err ? <p className="mut pad">{err}</p> : (
        <div className="vscroll" ref={wrap}>
          <div className="vpage"><canvas ref={cv} />
            {boxes.map((f) => <button key={f.id} className={'bbox ' + (f.id === activeId ? 'on' : '') + (f.low && !f.verified ? ' low' : '')} title={`${f.name}: ${f.value}`} onClick={() => onPick(f)}
              style={{ left: f.bbox.x * k, top: f.bbox.y * k, width: f.bbox.w * k, height: f.bbox.h * k }} />)}
          </div>
        </div>)}
    </div>
  );
}
const dpr_ = (d) => d || 200;
