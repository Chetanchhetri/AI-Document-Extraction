import React, { useEffect, useState } from 'react';
import { 
  ArrowLeftRight, 
  BarChart3, 
  Boxes, 
  Download, 
  FileCheck2, 
  FileSpreadsheet, 
  Sparkles 
} from 'lucide-react';
import { api, getBase } from '../api.js';
import { arr, normReview } from '../normalize.js';
import { Badge, PageHead, useToast } from '../ui.jsx';

function FormattedText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, lIdx) => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <React.Fragment key={lIdx}>
            {lIdx > 0 && <br />}
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                return <b key={pIdx}>{part.slice(2, -2)}</b>;
              }
              return part;
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}

export default function CompareWorkspace() {
  const toast = useToast();
  const [ships, setShips] = useState([]);
  const [shipmentAId, setShipmentAId] = useState('');
  const [shipmentBId, setShipmentBId] = useState('');
  
  const [dataA, setDataA] = useState(null);
  const [dataB, setDataB] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState('');

  // Load all shipments dropdown
  useEffect(() => {
    api.shipments({ limit: 100 })
      .then((r) => {
        const list = arr(r);
        setShips(list);
        if (list.length >= 2) {
          setShipmentAId(list[0].id);
          setShipmentBId(list[1].id);
        }
      })
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);

  // Load shipment A
  useEffect(() => {
    if (!shipmentAId) return setDataA(null);
    setLoadingA(true);
    api.review(shipmentAId)
      .then((raw) => setDataA(normReview(raw)))
      .catch((e) => toast(`Failed to load Shipment A: ${e.message}`, 'err'))
      .finally(() => setLoadingA(false));
  }, [shipmentAId, toast]);

  // Load shipment B
  useEffect(() => {
    if (!shipmentBId) return setDataB(null);
    setLoadingB(true);
    api.review(shipmentBId)
      .then((raw) => setDataB(normReview(raw)))
      .catch((e) => toast(`Failed to load Shipment B: ${e.message}`, 'err'))
      .finally(() => setLoadingB(false));
  }, [shipmentBId, toast]);

  // Trigger Gemma 2 (2B) Comparative Analysis
  const runComparison = async () => {
    if (!dataA || !dataB) {
      toast('Please select two valid shipments to generate a comparison report.', 'warn');
      return;
    }

    setAnalyzing(true);
    setReport('');

    try {
      const baseUrl = getBase() || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/api/v1/copilot/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipments: [dataA, dataB] })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${res.status})`);
      }

      const resData = await res.json();
      setReport(resData.report);
      toast('Comparative intelligence analysis generated!', 'ok');
    } catch (err) {
      toast(`Comparison Error: ${err.message}`, 'err');
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const header = `PORTLINE CUSTOMS COMPARISON REPORT\nGenerated: ${new Date().toLocaleString()}\n`;
    const meta = `Shipment A: ${dataA?.shipment?.shipment_code} (${dataA?.shipment?.supplier_name})\nShipment B: ${dataB?.shipment?.shipment_code} (${dataB?.shipment?.supplier_name})\n\n`;
    const content = header + meta + report.replace(/\*\*/g, '');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Comparison_${dataA?.shipment?.shipment_code}_vs_${dataB?.shipment?.shipment_code}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const extractMetric = (dataset, keys) => {
    if (!dataset?.fields) return '—';
    const found = dataset.fields.find((f) => 
      keys.some((k) => f.name.toLowerCase().includes(k))
    );
    return found?.value || '—';
  };

  return (
    <>
      <PageHead 
        title="Compare & Analyze" 
        sub="Side-by-side customs intelligence, company supplier variance, and AI report generation."
      >
        <button 
          className="primary" 
          onClick={runComparison} 
          disabled={analyzing || !dataA || !dataB}
        >
          <Sparkles size={14} />
          {analyzing ? 'Analyzing with Gemma 2…' : 'Generate AI Report'}
        </button>
      </PageHead>

      {/* Selectors */}
      <div className="grid two gap-3" style={{ marginBottom: '16px' }}>
        <div className="card pad">
          <small className="mut block mb-1">SELECT SHIPMENT / COMPANY A</small>
          <select 
            value={shipmentAId} 
            onChange={(e) => setShipmentAId(e.target.value)} 
            aria-label="Select Shipment A"
            style={{ width: '100%' }}
          >
            <option value="">Select First Shipment…</option>
            {ships.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === shipmentBId}>
                {s.shipment_code} · {s.supplier_name}
              </option>
            ))}
          </select>
        </div>

        <div className="card pad">
          <small className="mut block mb-1">SELECT SHIPMENT / COMPANY B</small>
          <select 
            value={shipmentBId} 
            onChange={(e) => setShipmentBId(e.target.value)} 
            aria-label="Select Shipment B"
            style={{ width: '100%' }}
          >
            <option value="">Select Second Shipment…</option>
            {ships.map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === shipmentAId}>
                {s.shipment_code} · {s.supplier_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Side-by-Side Comparison Table */}
      <div className="card pad" style={{ marginBottom: '16px' }}>
        <div className="row between mb-3">
          <b className="row gap-2">
            <ArrowLeftRight size={16} /> Comparative Audit Metrics
          </b>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
              <th style={{ padding: '8px' }}>Metric / Attribute</th>
              <th style={{ padding: '8px' }}>Shipment A: {dataA?.shipment?.shipment_code || '—'}</th>
              <th style={{ padding: '8px' }}>Shipment B: {dataB?.shipment?.shipment_code || '—'}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Company / Supplier</td>
              <td style={{ padding: '8px' }}><b>{dataA?.shipment?.supplier_name || '—'}</b></td>
              <td style={{ padding: '8px' }}><b>{dataB?.shipment?.supplier_name || '—'}</b></td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Filing Status</td>
              <td style={{ padding: '8px' }}>{dataA?.shipment ? <Badge status={dataA.shipment.status} /> : '—'}</td>
              <td style={{ padding: '8px' }}>{dataB?.shipment ? <Badge status={dataB.shipment.status} /> : '—'}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Total Declared Value</td>
              <td style={{ padding: '8px' }}>{extractMetric(dataA, ['total', 'amount', 'invoice_value', 'grand_total'])}</td>
              <td style={{ padding: '8px' }}>{extractMetric(dataB, ['total', 'amount', 'invoice_value', 'grand_total'])}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Gross / Net Weight</td>
              <td style={{ padding: '8px' }}>{extractMetric(dataA, ['weight', 'gross', 'net'])}</td>
              <td style={{ padding: '8px' }}>{extractMetric(dataB, ['weight', 'gross', 'net'])}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Extracted Fields</td>
              <td style={{ padding: '8px' }}>{dataA ? `${dataA.fields.length} fields` : '—'}</td>
              <td style={{ padding: '8px' }}>{dataB ? `${dataB.fields.length} fields` : '—'}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <td style={{ padding: '8px' }} className="mut">Line Items Extracted</td>
              <td style={{ padding: '8px' }}>{dataA ? `${dataA.lines.length} items` : '—'}</td>
              <td style={{ padding: '8px' }}>{dataB ? `${dataB.lines.length} items` : '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '8px' }} className="mut">Discrepancy Checks</td>
              <td style={{ padding: '8px' }}>
                {dataA ? `${dataA.checks.filter(c => c.failed).length} failed / ${dataA.checks.length}` : '—'}
              </td>
              <td style={{ padding: '8px' }}>
                {dataB ? `${dataB.checks.filter(c => c.failed).length} failed / ${dataB.checks.length}` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* AI Comparison Report output */}
      {report && (
        <div className="card pad" style={{ border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <div className="row between mb-3">
            <div className="row gap-2">
              <Sparkles size={16} style={{ color: '#3b82f6' }} />
              <b>Gemma 2 Comparative Intelligence Report</b>
            </div>
            <button className="ghost" onClick={downloadReport}>
              <Download size={14} /> Download Report
            </button>
          </div>
          <div style={{ fontSize: '14px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px' }}>
            <FormattedText text={report} />
          </div>
        </div>
      )}
    </>
  );
}