import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  AlertCircle,
  Bot, 
  Boxes, 
  RefreshCw, 
  Send, 
  Sparkles, 
  User 
} from 'lucide-react';
import { api, getBase } from '../api.js';
import { arr, normReview } from '../normalize.js';
import { activeShipment } from '../store.js';
import { Badge, PageHead, useToast } from '../ui.jsx';

const PROMPT_SUGGESTIONS = [
  "What is the weight of this shipment?",
  "How many units are present in it?",
  "Which country does this shipment belong to?",
  "Summarize extracted fields and discrepancies"
];

// Renders markdown **bold** as <b> HTML tags safely
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
  const [statusNotice, setStatusNotice] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hello! I am your Portline AI Assistant powered by Gemma 2 (2B). Ask me any question about your shipment documents.'
    }
  ]);
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef(null);

  // Load available shipments
  useEffect(() => {
    api.shipments({ limit: 100 })
      .then((r) => setShips(arr(r)))
      .catch((e) => toast(e.message, 'err'));
  }, [toast]);

  // Fetch target shipment context
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

  // Auto-scroll chat stream smooth alignment
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking, statusNotice]);

  // Routes requests to local Gemma 2 (2B) Backend API
  const askLLM = async (userQuestion) => {
    if (!userQuestion.trim()) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text: userQuestion };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setThinking(true);
    setStatusNotice('');

    try {
      const baseUrl = getBase() || 'http://localhost:8000';
      const token = localStorage.getItem('access_token');

      const res = await fetch(`${baseUrl}/api/v1/copilot/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          query: userQuestion,
          shipment_code: shipmentContext?.shipment?.shipment_code,
          supplier_name: shipmentContext?.shipment?.supplier_name,
          context: shipmentContext
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      const replyText = data.reply || data.response || data.detail || 'No response generated.';

      // Intercept background loading notices to avoid message stacking overlaps
      if (replyText.includes('currently loading') || replyText.includes('initializing in the background') || replyText.includes('downloading')) {
        setStatusNotice(replyText);
        toast(replyText, 'warn');
      } else {
        setStatusNotice('');
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: 'assistant', text: replyText }
        ]);
      }
    } catch (err) {
      toast(`Gemma 2 API Error: ${err.message}`, 'err');
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <PageHead 
        title="AI Copilot" 
        sub="Ask context-aware questions about your customs documents, extraction confidence, and cross-checks."
      >
        <button className="ghost" onClick={() => loadShipmentData(selectedId)}>
          <RefreshCw size={14} className={loadingContext ? "animate-spin" : ""} /> Refresh Context
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
          minHeight: '520px',
          overflow: 'hidden'
        }}
      >
        
        {/* Messages Stream with Strict Layout Isolation */}
        <div 
          className="scroll" 
          style={{ 
            flex: 1, 
            minHeight: 0,
            overflowY: 'auto', 
            paddingRight: '6px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {messages.map((m) => (
            <div 
              key={m.id} 
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: m.role === 'user' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: '1px solid ' + (m.role === 'user' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.06)'),
                width: '100%',
                boxSizing: 'border-box',
                flexShrink: 0
              }}
            >
              <div className="avatar small mt-1" style={{ flexShrink: 0 }}>
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <small className="mut block" style={{ fontSize: '11px', marginBottom: '4px' }}>
                  {m.role === 'user' ? 'You' : 'Portline Assistant (Gemma 2)'}
                </small>
                <div style={{ fontSize: '14px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                  <FormattedText text={m.text} />
                </div>
              </div>
            </div>
          ))}

          {/* Dedicated Status Banner for Initialization / Memory Loading */}
          {statusNotice && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#f59e0b',
                fontSize: '13px',
                flexShrink: 0
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{statusNotice}</span>
            </div>
          )}

          {thinking && (
            <div className="row gap-2 mut" style={{ padding: '8px 12px', flexShrink: 0 }}>
              <Sparkles size={16} className="animate-spin" />
              <small>Gemma 2 (2B) is processing your question…</small>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Prompt Suggestions & Input Bar */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', flexShrink: 0 }}>
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