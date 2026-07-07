import { useCallback, useEffect, useRef, useState } from 'react';
import { loadJsPDF } from '../lib/lazyJspdf';
import { Bot, ChevronDown, ChevronUp, FileDown, Loader2, MessageSquare, Send, Sparkles, User, Wrench } from 'lucide-react';
import ApolloToday from './ApolloToday.jsx';

const STARTERS = [
  'Show product 8610100001',
  'Which products have negative stock?',
  'Find customer Plushprops',
  'Which products have the lowest stock?',
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
        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          return (
            <img
              key={i}
              src={imgMatch[2]}
              alt={imgMatch[1] || 'Product'}
              className="apollo-md-img"
              loading="lazy"
            />
          );
        }
        if (trimmed.startsWith('## ')) return <h3 key={i}>{renderInline(trimmed.slice(3))}</h3>;
        if (trimmed.startsWith('### ')) return <h4 key={i} className="apollo-md-h4">{renderInline(trimmed.slice(4))}</h4>;
        if (trimmed.startsWith('#### ')) return <h5 key={i} className="apollo-md-h5">{renderInline(trimmed.slice(5))}</h5>;
        if (trimmed === '---') return <hr key={i} className="apollo-md-hr" />;
        if (trimmed.startsWith('_') && trimmed.endsWith('_')) return <p key={i} className="apollo-md-muted">{renderInline(trimmed.slice(1, -1))}</p>;
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

async function exportMessagePdf(content, title = 'Apollo Report') {
  const jsPDF = await loadJsPDF();
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

function formatErrorMessage(value, fallback = 'Something went wrong') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === 'object') {
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
    if (value.error && typeof value.error.message === 'string') return value.error.message;
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return String(value);
}

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

export default function ApolloPanel({ onShowToast }) {
  const [messages, setMessages] = useState(loadApolloMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [indexStatus, setIndexStatus] = useState(null);
  const [indexError, setIndexError] = useState('');
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(messages.length > 0);
  const scrollRef = useRef(null);
  const askRef = useRef(null);

  const loadIndexStatus = useCallback(async (refresh = false) => {
    setIndexError('');
    try {
      const res = await fetch(`/api/apollo${refresh ? '?refresh=1' : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(formatErrorMessage(json?.error, 'Index build failed'));
      if (json.ok) setIndexStatus(json);
    } catch (err) {
      setIndexError(formatErrorMessage(err, 'Could not load Apollo briefing'));
      onShowToast?.(formatErrorMessage(err, 'Apollo briefing failed'), 'error');
    }
  }, [onShowToast]);

  useEffect(() => {
    void loadIndexStatus(false);
  }, [loadIndexStatus]);

  const rebuildIndex = useCallback(async () => {
    setRebuildingIndex(true);
    try {
      await loadIndexStatus(true);
      onShowToast?.('Briefing refreshed', 'success');
    } finally {
      setRebuildingIndex(false);
    }
  }, [loadIndexStatus, onShowToast]);

  useEffect(() => {
    if (chatExpanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, busy, chatExpanded]);

  useEffect(() => {
    try {
      sessionStorage.setItem(APOLLO_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* quota */ }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setChatExpanded(false);
    try { sessionStorage.removeItem(APOLLO_STORAGE_KEY); } catch {}
  }, []);

  const send = useCallback(async (text, { fix = false, replaceLast = false } = {}) => {
    const trimmed = String(text || '').trim();
    if (!trimmed && !fix) return;
    if (busy) return;

    setChatExpanded(true);
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
      if (!res.ok) throw new Error(formatErrorMessage(json?.error, 'Apollo request failed'));

      const replyText = typeof json.reply === 'string'
        ? json.reply
        : (json.reply != null ? JSON.stringify(json.reply) : 'No response from Apollo.');

      const assistantMsg = {
        role: 'assistant',
        content: replyText,
        source: json.source,
        intent: json.intent,
      };

      setMessages((prev) => (
        fix || replaceLast ? [...prev.slice(0, -1), assistantMsg] : [...prev, assistantMsg]
      ));
    } catch (e) {
      setError(formatErrorMessage(e, 'Apollo request failed'));
      if (fix) setMessages(messages);
    } finally {
      setBusy(false);
    }
  }, [busy, messages]);

  const askFromToday = useCallback((query) => {
    setChatExpanded(true);
    askRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void send(query);
  }, [send]);

  const fixLastReply = useCallback(() => {
    void send('', { fix: true });
  }, [send]);

  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);
  const briefContext = indexStatus?.brief?.context;
  const briefMeta = indexStatus?.brief?.meta;

  return (
    <div className="apollo-panel apollo-panel--today">
      <div className="apollo-head">
        <div className="apollo-head-brand">
          <div className="apollo-head-icon"><Bot size={20} /></div>
          <div>
            <h2 className="apollo-head-title">Apollo</h2>
            <p className="apollo-head-sub">
              Business homepage · {indexStatus ? `${indexStatus.counts?.products?.toLocaleString() ?? '—'} products` : 'loading…'}
            </p>
            {indexError && <p className="apollo-index-error">{indexError}</p>}
          </div>
        </div>
        <div className="apollo-head-actions">
          <button
            type="button"
            className="apollo-action-btn apollo-action-btn--ghost"
            onClick={() => void rebuildIndex()}
            disabled={busy || rebuildingIndex}
            title="Refresh Today briefing"
          >
            {rebuildingIndex ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
            {rebuildingIndex ? 'Refreshing…' : 'Refresh'}
          </button>
          {messages.length > 0 && (
            <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={clearChat} disabled={busy}>
              Clear chat
            </button>
          )}
        </div>
      </div>

      <div className="apollo-today-page">
        <ApolloToday
          context={briefContext}
          meta={briefMeta}
          loading={!indexStatus && !indexError}
          onAsk={askFromToday}
          onRefresh={() => void rebuildIndex()}
          refreshing={rebuildingIndex}
        />

        <section className="apollo-ask" id="ask-apollo" ref={askRef}>
          <button
            type="button"
            className="apollo-ask-toggle"
            onClick={() => setChatExpanded((v) => !v)}
            aria-expanded={chatExpanded}
          >
            <MessageSquare size={16} />
            <span>5. Ask Apollo</span>
            {messages.length > 0 && <span className="apollo-ask-count">{messages.length}</span>}
            {chatExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {chatExpanded && (
            <div className="apollo-ask-body">
              <div className="apollo-chat apollo-chat--embedded" ref={scrollRef}>
                {messages.length === 0 && (
                  <div className="apollo-ask-starters">
                    {STARTERS.map((s) => (
                      <button key={s} type="button" className="apollo-starter apollo-starter--compact" onClick={() => void send(s)} disabled={busy}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
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

              <div className="apollo-composer apollo-composer--embedded">
                {error && <p className="apollo-error">{error}</p>}
                <form
                  className="apollo-input-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <textarea
                    className="apollo-input apollo-input--textarea"
                    rows={2}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send(input);
                      }
                    }}
                    placeholder="Ask about a product code, customer, or stock priority…"
                    disabled={busy}
                  />
                  <button type="submit" className="apollo-send-btn" disabled={busy || !input.trim()} aria-label="Send">
                    {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
