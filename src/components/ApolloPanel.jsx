import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Bot, FileDown, Loader2, Send, Sparkles, User, Wrench } from 'lucide-react';

const STARTERS = [
  'What are my best performing products by orders?',
  'Which products have the lowest stock?',
  'Give me 5 products with negative stock',
  'Fix images for all products in subcategory games and puzzles',
  'Products with codes ABC123 and XYZ789 resize to 800x800 white background',
  'Do image gen on all monttaro canvas products — white background, product in view, painting on the canvas',
  'All monttaro canvas with soft shadow on white background',
  'Who are all my customers?',
];

function renderInline(text) {
  if (!text) return null;
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key++} className="apollo-inline-code">{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseMessageContent(text) {
  const parts = [];
  const re = /```chart\s*\n([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', content: text.slice(last, match.index).trim() });
    }
    try {
      parts.push({ type: 'chart', content: JSON.parse(match[1].trim()) });
    } catch {
      parts.push({ type: 'text', content: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last).trim() });
  return parts.filter((p) => p.content);
}

function SimpleMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="apollo-md">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) return <h3 key={i}>{renderInline(trimmed.slice(3))}</h3>;
        if (trimmed.startsWith('### ')) return <h4 key={i}>{renderInline(trimmed.slice(4))}</h4>;
        if (trimmed.startsWith('- ')) return <p key={i} className="apollo-md-bullet"><span className="apollo-md-dot">•</span>{renderInline(trimmed.slice(2))}</p>;
        if (/^\d+\.\s/.test(trimmed)) return <p key={i} className="apollo-md-bullet">{renderInline(trimmed)}</p>;
        return trimmed ? <p key={i}>{renderInline(trimmed)}</p> : null;
      })}
    </div>
  );
}

function BarChart({ chart }) {
  const labels = chart.labels || [];
  const values = (chart.values || []).map((v) => Number(v) || 0);
  const peak = Math.max(1, ...values);
  return (
    <div className="apollo-chart">
      {chart.title && <div className="apollo-chart-title">{chart.title}</div>}
      <div className="apollo-chart-bars">
        {labels.map((label, i) => (
          <div key={`${label}-${i}`} className="apollo-chart-col" title={`${label}: ${values[i]}`}>
            <div className="apollo-chart-val">{values[i]}</div>
            <div className="apollo-chart-track">
              <div className="apollo-chart-fill" style={{ height: `${(values[i] / peak) * 100}%` }} />
            </div>
            <div className="apollo-chart-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBody({ content }) {
  const parts = parseMessageContent(content);
  return (
    <>
      {parts.map((part, i) => (
        part.type === 'chart'
          ? <BarChart key={i} chart={part.content} />
          : <SimpleMarkdown key={i} text={part.content} />
      ))}
    </>
  );
}

function ApolloWelcome({ onStarter, busy }) {
  return (
    <div className="apollo-welcome">
      <div className="apollo-welcome-badge">
        <Bot size={22} strokeWidth={2.2} />
      </div>
      <div className="apollo-welcome-copy">
        <h3>Hi, I'm <span className="apollo-welcome-name">Apollo</span></h3>
        <p>
          Ask in plain English — every question is routed through live data first
          (products, customers, orders, searches). Answers come from your index,
          not guesswork.
        </p>
      </div>
      <div className="apollo-welcome-starters">
        <span className="apollo-welcome-hint">Try asking</span>
        <div className="apollo-starters">
          {STARTERS.map((s) => (
            <button key={s} type="button" className="apollo-starter" onClick={() => onStarter(s)} disabled={busy}>
              <Sparkles size={13} />
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImageFixProgress({ progress }) {
  if (!progress) return null;
  const pct = progress.total ? Math.round(((progress.index + (progress.status === 'done' || progress.status === 'error' ? 1 : 0)) / progress.total) * 100) : 0;
  return (
    <div className="apollo-batch-progress">
      <div className="apollo-batch-progress-head">
        <Loader2 size={14} className="spin" />
        <span>Fixing images — {progress.done + progress.failed}/{progress.total}</span>
      </div>
      <div className="apollo-batch-progress-bar"><div style={{ width: `${pct}%` }} /></div>
      <p className="apollo-batch-progress-item">{progress.title || progress.sku}</p>
    </div>
  );
}

function ChatMessage({ msg, isLastAssistant, onExportPdf, onFix, fixBusy }) {
  const isUser = msg.role === 'user';
  const showFix = isLastAssistant && !isUser && msg.source !== 'live-index';
  return (
    <div className={`apollo-msg-row apollo-msg-row--${msg.role}`}>
      <div className={`apollo-avatar apollo-avatar--${msg.role}`} aria-hidden="true">
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className="apollo-msg-stack">
        <div className="apollo-msg-meta">
          <span className="apollo-msg-name">{isUser ? 'You' : 'Apollo'}</span>
          {!isUser && msg.source && (
            <span className={`apollo-source apollo-source--${msg.source}`}>
              {msg.source === 'live-index' ? 'Live index'
                : msg.source === 'fixed' ? 'Fixed'
                  : msg.source === 'live' ? 'Live data'
                    : 'AI'}
            </span>
          )}
        </div>
        <div className={`apollo-msg-body apollo-msg-body--${msg.role}`}>
          {isUser ? <p>{msg.content}</p> : <MessageBody content={msg.content} />}
          {!isUser && msg.batchProgress && <ImageFixProgress progress={msg.batchProgress} />}
          {!isUser && msg.batchComplete && (
            <p className="apollo-batch-done">{renderInline(msg.batchComplete)}</p>
          )}
        </div>
        {showFix && (
          <div className="apollo-msg-actions">
            <button type="button" className="apollo-action-btn" onClick={onFix} disabled={fixBusy}>
              <Wrench size={13} /> {fixBusy ? 'Fixing…' : 'Fix this'}
            </button>
            <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={() => onExportPdf(msg.content)}>
              <FileDown size={13} /> Export PDF
            </button>
          </div>
        )}
        {isLastAssistant && !isUser && !showFix && (
          <div className="apollo-msg-actions">
            <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={() => onExportPdf(msg.content)}>
              <FileDown size={13} /> Export PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function exportMessagePdf(content, title = 'Apollo Report') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;
  doc.setFillColor(196, 0, 0);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 5, 'F');
  doc.setTextColor(196, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROTO TRADING · APOLLO', margin, y);
  y += 20;
  doc.setTextColor(17, 17, 17);
  doc.setFontSize(18);
  doc.text(title, margin, y);
  y += 28;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  const plain = content
    .replace(/```chart[\s\S]*?```/g, '[Chart included in dashboard view]')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
  const lines = doc.splitTextToSize(plain, doc.internal.pageSize.getWidth() - margin * 2);
  lines.forEach((line) => {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 14;
  });
  doc.save(`apollo-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const APOLLO_STORAGE_KEY = 'proto_apollo_chat_v1';

function loadApolloMessages() {
  try {
    const raw = sessionStorage.getItem(APOLLO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ApolloPanel({ onReprocessBatch }) {
  const [messages, setMessages] = useState(loadApolloMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [indexStatus, setIndexStatus] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    void fetch('/api/apollo')
      .then((r) => r.json())
      .then((json) => { if (json.ok) setIndexStatus(json); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    try {
      sessionStorage.setItem(APOLLO_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* quota */ }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    try { sessionStorage.removeItem(APOLLO_STORAGE_KEY); } catch {}
  }, []);

  const send = useCallback(async (text, { fix = false, replaceLast = false } = {}) => {
    const trimmed = String(text || '').trim();
    if (!trimmed && !fix) return;
    if (busy) return;
    setError('');
    setBusy(true);

    let nextMessages = messages;
    let badReply = '';
    let previousIntent = '';

    if (fix) {
      const last = messages[messages.length - 1];
      if (last?.role !== 'assistant') {
        setBusy(false);
        return;
      }
      badReply = last.content;
      previousIntent = last.intent || '';
      nextMessages = messages.slice(0, -1);
      setMessages(nextMessages);
    } else {
      nextMessages = [...messages, { role: 'user', content: trimmed }];
      setMessages(nextMessages);
      setInput('');
    }

    try {
      const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));
      const res = await fetch('/api/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          fix,
          badReply,
          previousIntent,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Apollo request failed');

      const assistantMsg = {
        role: 'assistant',
        content: json.reply,
        source: json.source,
        intent: json.intent,
        batchAction: json.batchAction || null,
      };

      let batchIndex = -1;
      setMessages((prev) => {
        const next = fix || replaceLast ? [...prev.slice(0, -1), assistantMsg] : [...prev, assistantMsg];
        batchIndex = next.length - 1;
        return next;
      });

      if (json.batchAction?.type === 'reprocess_to_dormant' && onReprocessBatch) {
        const label = json.batchAction.subcategory || '';
        const imagePrompt = json.batchAction.imagePrompt || '';
        void onReprocessBatch(json.batchAction.products, {
          label,
          switchTab: true,
          skipConfirm: true,
          imagePrompt: json.batchAction.imagePrompt || '',
          imageStyle: json.batchAction.imageStyle || '',
        });
        if (batchIndex >= 0) {
          setMessages((prev) => prev.map((m, i) => (
            i === batchIndex
              ? { ...m, batchComplete: `✓ Sent **${json.batchAction.products.length}** products to New Products — switch to the **New Products** tab to watch the live feed.` }
              : m
          )));
        }
      }
    } catch (e) {
      setError(e.message);
      if (fix) setMessages(messages);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, onReprocessBatch]);

  const fixLastReply = useCallback(() => {
    void send('', { fix: true });
  }, [send]);

  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);
  const showWelcome = messages.length === 0;

  return (
    <div className="apollo-panel">
      <div className="apollo-head">
        <div className="apollo-head-brand">
          <div className="apollo-head-icon"><Bot size={20} /></div>
          <div>
            <h2 className="apollo-head-title">Apollo</h2>
            <p className="apollo-head-sub">
              Live keyword index · {indexStatus ? `${indexStatus.counts?.products?.toLocaleString() ?? '—'} products, ${indexStatus.counts?.customers ?? '—'} customers` : 'building…'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={clearChat} disabled={busy}>
            Clear chat
          </button>
        )}
      </div>

      <div className="apollo-shell">
        <div className="apollo-chat" ref={scrollRef}>
          {showWelcome && <ApolloWelcome onStarter={send} busy={busy} />}
          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              msg={msg}
              isLastAssistant={i === lastAssistantIdx && !busy}
              onExportPdf={exportMessagePdf}
              onFix={fixLastReply}
              fixBusy={busy}
            />
          ))}
          {busy && (
            <div className="apollo-msg-row apollo-msg-row--assistant">
              <div className="apollo-avatar apollo-avatar--assistant" aria-hidden="true">
                <Bot size={15} />
              </div>
              <div className="apollo-msg-stack">
                <div className="apollo-msg-meta"><span className="apollo-msg-name">Apollo</span></div>
                <div className="apollo-msg-body apollo-msg-body--assistant apollo-thinking">
                  <Loader2 size={15} className="spin" />
                  <span>Analysing your data…</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="apollo-composer">
          {error && <p className="apollo-error">{error}</p>}
          <form
            className="apollo-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              className="apollo-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about orders, stock, customers — or fix images by subcategory…"
              disabled={busy}
            />
            <button type="submit" className="apollo-send-btn" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
