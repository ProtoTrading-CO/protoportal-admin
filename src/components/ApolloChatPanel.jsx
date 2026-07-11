import { useEffect, useRef } from 'react';
import { loadJsPDF } from '../lib/lazyJspdf';
import { Bot, FileDown, Loader2, MessageSquare, Send, User, Wrench } from 'lucide-react';

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

export async function exportApolloMessagePdf(content, title = 'Apollo Report') {
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

export default function ApolloChatPanel({
  messages,
  input,
  onInputChange,
  onSend,
  busy,
  error,
  onFixLast,
  onClear,
  variant = 'compact',
}) {
  const scrollRef = useRef(null);
  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);
  const isCompact = variant === 'compact';

  useEffect(() => {
    if (!isCompact || messages.length) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, busy, isCompact]);

  return (
    <aside className={`apollo-cc-chat${isCompact ? ' apollo-cc-chat--compact' : ''}`} aria-label="Apollo chat">
      {!isCompact && (
        <header className="apollo-cc-chat-head">
          <MessageSquare size={16} />
          <h3>Apollo</h3>
          {messages.length > 0 && (
            <button type="button" className="apollo-cc-chat-clear" onClick={onClear} disabled={busy}>
              Clear
            </button>
          )}
        </header>
      )}

      {isCompact && messages.length > 0 && (
        <details className="apollo-cc-chat-thread">
          <summary>Conversation ({messages.length})</summary>
          <div className="apollo-cc-chat-body apollo-cc-chat-body--thread" ref={scrollRef}>
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                msg={msg}
                isLastAssistant={i === lastAssistantIdx && !busy}
                onExportPdf={exportApolloMessagePdf}
                onFix={onFixLast}
                fixBusy={busy}
              />
            ))}
            {busy && (
              <div className="apollo-msg-row apollo-msg-row--assistant">
                <div className="apollo-avatar apollo-avatar--assistant" aria-hidden="true">
                  <Bot size={15} />
                </div>
                <div className="apollo-msg-stack">
                  <div className="apollo-msg-body apollo-msg-body--assistant apollo-thinking">
                    <Loader2 size={15} className="spin" />
                    <span>Analysing…</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="apollo-cc-chat-clear apollo-cc-chat-clear--inline" onClick={onClear} disabled={busy}>
            Clear
          </button>
        </details>
      )}

      {!isCompact && (
        <div className="apollo-cc-chat-body" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="apollo-cc-chat-idle">
              <p className="apollo-cc-chat-idle-lead">Supporting tool — ask when you need depth.</p>
              <div className="apollo-ask-starters">
                {STARTERS.map((s) => (
                  <button key={s} type="button" className="apollo-starter apollo-starter--compact" onClick={() => void onSend(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              msg={msg}
              isLastAssistant={i === lastAssistantIdx && !busy}
              onExportPdf={exportApolloMessagePdf}
              onFix={onFixLast}
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
      )}

      <div className="apollo-cc-chat-composer">
        {error && <p className="apollo-error">{error}</p>}
        <form
          className={`apollo-input-row${isCompact ? ' apollo-input-row--compact' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            void onSend(input);
          }}
        >
          {isCompact ? (
            <input
              type="text"
              className="apollo-input apollo-input--compact"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Talk to Apollo…"
              disabled={busy}
            />
          ) : (
            <textarea
              className="apollo-input apollo-input--textarea"
              rows={2}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend(input);
                }
              }}
              placeholder="Ask Apollo…"
              disabled={busy}
            />
          )}
          <button type="submit" className="apollo-send-btn" disabled={busy || !input.trim()} aria-label="Send">
            {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </aside>
  );
}
