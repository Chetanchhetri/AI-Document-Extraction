import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Bot, 
  Boxes, 
  RefreshCw, 
  Send, 
  Sparkles, 
  User 
} from 'lucide-react';
import { api } from '../api.js';
import { arr, normReview } from '../normalize.js';
import { activeShipment } from '../store.js';
import { Badge, PageHead, useToast } from '../ui.jsx';

const PROMPT_SUGGESTIONS = [
  "What is the weight of this shipment?",
  "How many units are present in it?",
  "Which country does this shipment belong to?",
  "Summarize extracted fields and discrepancies"
];

// Helper to render **bold** syntax cleanly as <b> elements
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

export default function NewSection() {
  const toast = useToast();
  const [ships, setShips] = useState([]);
  const [selectedId, setSelectedId] = useState(activeShipment.get() || '');
  const [shipmentContext, setShipmentContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);
  
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! Ask me any question about shipment weight, unit quantities, country of origin, or extracted document fields.'
    }
  ]);
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef(null);

  // Load available shipments list
  useEffect(() => {
    api.shipments({ limit: 100 })
      .then((r) => setShips(arr(r)))
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);

  // Fetch full review data (context) when selected shipment changes
  const loadShipmentData = useCallback(async (id) => {
    if (!id) {
      setShipmentContext(null);
      return;
    }
    setLoadingContext(true);
    try {
      const raw = await api.review(id);
      const normalized = normReview(raw);
      setShipmentContext(normalized);
      activeShipment.set(id);
    } catch (e) {
      toast(`Failed to load context for shipment: ${e.message}`, 'err');
    } finally {
      setLoadingContext(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedId) {
      loadShipmentData(selectedId);
    }
  }, [selectedId, loadShipmentData]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Direct & Dynamic Field Intelligence Handler
  const askLLM = async (userQuestion) => {
    if (!userQuestion.trim()) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text: userQuestion };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setThinking(true);

    try {
      let replyText = '';
      const qLower = userQuestion.toLowerCase().trim();

      // 1. WORKSPACE-WIDE SHIPMENT COUNT
      if (/\b(how many|count|total)\b/.test(qLower) && qLower.includes('shipment')) {
        replyText = `There are currently **${ships.length} shipment(s)** in this workspace.`;
      } 
      else if (!shipmentContext) {
        replyText = "Please select a shipment from the dropdown above to inspect its context.";
      } 
      else {
        const { shipment, fields, checks, lines, docs, blockers, ready } = shipmentContext;

        const findField = (...terms) => fields.find((f) => {
          const name = f.name.toLowerCase().replace(/_/g, ' ');
          return terms.some((term) => name.includes(term));
        });

        const getCountry = () => {
          const match = shipment.supplier_name?.match(/\(([^)]+)\)/);
          if (match) return match[1];
          const origin = findField('country', 'origin', 'loading', 'seller_country');
          return origin?.value || 'Unspecified';
        };

        // 2. WEIGHT / MASS QUERIES
        if (/\b(weight|gross|net|kg|lbs|mass|ton|tons)\b/.test(qLower)) {
          const weightField = findField('weight', 'gross_weight', 'net_weight', 'total_weight');
          if (weightField && weightField.value) {
            replyText = `The weight of **${shipment.shipment_code}** is **${weightField.value}** (${weightField.name.replace(/_/g, ' ')}).`;
          } else {
            replyText = `No weight field was extracted for **${shipment.shipment_code}**.`;
          }
        }
        // 3. UNITS / QUANTITY / PACKAGES / PIECES
        else if (/\b(unit|units|quantity|qty|package|packages|piece|pieces|carton|cartons|box|boxes|pcs)\b/.test(qLower)) {
          const qtyField = findField('quantity', 'total_quantity', 'total_packages', 'packages', 'units', 'cartons');
          const totalLineQty = lines.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);

          if (qtyField && qtyField.value) {
            replyText = `**${shipment.shipment_code}** has **${qtyField.value}** (${qtyField.name.replace(/_/g, ' ')}).`;
          } else if (totalLineQty > 0) {
            replyText = `**${shipment.shipment_code}** contains **${totalLineQty} units** across ${lines.length} extracted line item(s).`;
          } else if (lines.length > 0) {
            replyText = `**${shipment.shipment_code}** has **${lines.length} line item(s)** extracted from the invoice.`;
          } else {
            replyText = `No unit quantity or line items were found in the extracted documents for **${shipment.shipment_code}**.`;
          }
        }
        // 4. COUNTRY / ORIGIN / SUPPLIER
        else if (/\b(country|county|origin|where|supplier)\b/.test(qLower)) {
          replyText = `Shipment **${shipment.shipment_code}** (${shipment.supplier_name}) belongs to **${getCountry()}**.`;
        }
        // 5. VALUE / PRICE / CURRENCY / AMOUNT / INVOICE TOTAL
        else if (/\b(price|cost|value|amount|currency|pay|payment|total|invoice value)\b/.test(qLower)) {
          const valField = findField('total', 'amount', 'invoice_value', 'grand_total', 'currency');
          if (valField && valField.value) {
            replyText = `The total value for **${shipment.shipment_code}** is **${valField.value}**.`;
          } else {
            replyText = `No total invoice value or currency was extracted for **${shipment.shipment_code}**.`;
          }
        }
        // 6. DISCREPANCIES / CROSS-CHECKS
        else if (/\b(discrepancy|discrepancies|mismatch|issue|error|check|checks)\b/.test(qLower)) {
          const failedChecks = checks.filter((c) => c.failed);
          if (failedChecks.length === 0) {
            replyText = `No discrepancies found for **${shipment.shipment_code}**. All cross-checks passed.`;
          } else {
            replyText = `Found **${failedChecks.length} issue(s)** for **${shipment.shipment_code}**:\n` +
              failedChecks.map((c) => `• **${c.rule}**: ${c.msg || 'Mismatch'}`).join('\n');
          }
        }
        // 7. EXTRACTED FIELDS LISTING / SUMMARY
        else if (/\b(field|fields|extract|summary|summarize)\b/.test(qLower)) {
          const lowConf = fields.filter((f) => f.low && !f.verified).length;
          replyText = `**${shipment.shipment_code} Summary**:\n` +
            `• Extracted Fields: ${fields.length} (${lowConf} pending review)\n` +
            `• Documents: ${docs.length}/3 uploaded\n` +
            `• Discrepancies: ${checks.filter((c) => c.failed).length}\n` +
            `• Export Status: ${ready ? 'Ready to File ✅' : 'Blocked ⚠️'}`;
        }
        // 8. DYNAMIC FIELD LOOKUP (Fallback for specific field names)
        else {
          const words = qLower.replace(/[^\w\s]/gi, '').split(/\s+/).filter((w) => w.length > 2);
          const matchedField = fields.find((f) => {
            const fieldName = f.name.toLowerCase().replace(/_/g, ' ');
            return words.some((word) => fieldName.includes(word));
          });

          if (matchedField) {
            replyText = `**${matchedField.name.replace(/_/g, ' ')}** for **${shipment.shipment_code}**: **${matchedField.value || '—'}**.`;
          } else {
            replyText = `Shipment **${shipment.shipment_code}** (${shipment.supplier_name}) — Status: **${shipment.status.replace('_', ' ')}**.`;
          }
        }
      }

      await new Promise((res) => setTimeout(res, 250));

      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', text: replyText }
      ]);
    } catch (err) {
      toast(`Error: ${err.message}`, 'err');
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <PageHead 
        title="Shipment AI Assistant" 
        sub="Ask context-aware questions about your customs documents, extraction confidence, and cross-checks."
      >
        <button className="ghost" onClick={() => loadShipmentData(selectedId)}>
          <RefreshCw size={14} /> Refresh Context
        </button>
      </PageHead>

      {/* Target Context Header Card */}
      <div className="card row between pad" style={{ marginBottom: '16px' }}>
        <div className="row gap-3">
          <Boxes size={20} className="mut" />
          <div>
            <small className="mut block" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Context</small>
            <div className="row gap-2 mt-1">
              {shipmentContext?.shipment ? (
                <>
                  <b className="mono">{shipmentContext.shipment.shipment_code}</b>
                  <Badge status={shipmentContext.shipment.status} />
                  <span className="mut">{shipmentContext.shipment.supplier_name}</span>
                </>
              ) : (
                <span className="mut">Select a shipment to query AI context</span>
              )}
            </div>
          </div>
        </div>
        <select 
          value={selectedId} 
          onChange={(e) => setSelectedId(e.target.value)} 
          aria-label="Select Shipment for LLM Context"
          style={{ minWidth: '240px' }}
        >
          <option value="">Choose shipment context…</option>
          {ships.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shipment_code} · {s.supplier_name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Chat Interface Container */}
      <div 
        className="card pad" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: 'calc(100vh - 240px)', 
          minHeight: '520px' 
        }}
      >
        
        {/* Messages Stream */}
        <div 
          className="scroll" 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            paddingRight: '4px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {messages.map((m) => (
            <div 
              key={m.id} 
              className="row top gap-3"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: m.role === 'user' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: '1px solid ' + (m.role === 'user' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.06)')
              }}
            >
              <div className="avatar small mt-1">
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div style={{ flex: 1 }}>
                <small className="mut block" style={{ fontSize: '11px', marginBottom: '4px' }}>
                  {m.role === 'user' ? 'You' : 'Portline Assistant'}
                </small>
                <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                  <FormattedText text={m.text} />
                </div>
              </div>
            </div>
          ))}

          {thinking && (
            <div className="row gap-2 mut" style={{ padding: '8px 12px' }}>
              <Sparkles size={16} className="animate-spin" />
              <small>Processing question…</small>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Prompt Suggestions & Input Bar */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
          <div className="chips" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {PROMPT_SUGGESTIONS.map((s, idx) => (
              <button 
                key={idx} 
                className="ghost" 
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => askLLM(s)}
                disabled={thinking}
              >
                <Sparkles size={12} style={{ marginRight: '4px' }} />
                {s}
              </button>
            ))}
          </div>

          <form 
            onSubmit={(e) => { e.preventDefault(); askLLM(query); }} 
            className="row nowrap gap-2"
          >
            <input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Ask anything about weight, units, country, or specific fields…"
              disabled={thinking}
              style={{ flex: 1 }}
            />
            <button className="primary" disabled={thinking || !query.trim()}>
              <Send size={15} />
              <span>Ask</span>
            </button>
          </form>
        </div>

      </div>
    </>
  );
}