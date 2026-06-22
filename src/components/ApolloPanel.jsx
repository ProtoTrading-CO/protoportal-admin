import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Bot, CheckCircle, FileDown, Loader2, Send, Sparkles, Square, User, Users, Wrench } from 'lucide-react';
import ApolloImageWizard from './ApolloImageWizard';
import { getActiveImageBatch, subscribeImageBatch } from '../lib/imageBatchTracker';
import { getImageGenOperator } from '../lib/imageGenSession';

const STARTERS = [
  'What are my best performing products by orders?',
  'Which products have the lowest stock?',
  'Give me 5 products with negative stock',
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
          (products, customers, orders, searches). Type <strong>/image</strong> to open the image generation wizard.
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

function ImageBatchBanner({ batch, onOpenApproval, onBackToWizard, onStop }) {
  if (!batch) return null;
  const processed = (batch.done || 0) + (batch.failed || 0);
  const pct = batch.total ? Math.round((processed / batch.total) * 100) : 0;

  if (batch.status === 'running') {
    return (
      <div className="apollo-batch-banner apollo-batch-banner--running" role="status">
        <Loader2 size={16} className="spin" />
        <div className="apollo-batch-banner-copy">
          <strong>Image batch running in the background</strong>
          <span>
            {processed}/{batch.total} images
            {batch.currentLabel ? ` · ${batch.currentLabel}` : ''}
            — chat with Apollo below while you wait
          </span>
          <div className="apollo-batch-banner-bar"><div style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="apollo-batch-banner-actions">
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onBackToWizard}>View batch</button>
          <button type="button" className="adm-btn-red adm-btn--sm" onClick={onOpenApproval}>Approval</button>
          {onStop && (
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onStop} title="Stop image generation">
              <Square size={12} fill="currentColor" /> Stop
            </button>
          )}
        </div>
      </div>
    );
  }

  if (batch.status === 'complete') {
    return (
      <div className="apollo-batch-banner apollo-batch-banner--done" role="status">
        <CheckCircle size={16} />
        <div className="apollo-batch-banner-copy">
          <strong>Image batch complete</strong>
          <span>{batch.done} staged{batch.failed ? ` · ${batch.failed} failed` : ''} — review in Approval or continue the wizard.</span>
        </div>
        <div className="apollo-batch-banner-actions">
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onBackToWizard}>View batch</button>
          <button type="button" className="adm-btn-red adm-btn--sm" onClick={onOpenApproval}>Approval</button>
        </div>
      </div>
    );
  }

  return null;
}

function RemoteBatchNotice({ batches, lockCount }) {
  if (!batches?.length) return null;
  return (
    <div className="apollo-remote-notice" role="status">
      <Users size={16} />
      <div>
        <strong>{batches.length === 1 ? 'Another user is generating images' : `${batches.length} other image batches running`}</strong>
        <span>
          {batches.map((b) => b.operator || 'Someone').join(', ')} — overlapping SKUs will queue automatically.
          {lockCount > 0 ? ` ${lockCount} slot lock${lockCount === 1 ? '' : 's'} active.` : ''}
        </span>
      </div>
    </div>
  );
}

export default function ApolloPanel({ isActive = true, taxonomyTree, onShowToast, onGoToApproval, onRefreshCatalog, imageFixRequest, onImageFixRequestHandled }) {
  const [messages, setMessages] = useState(loadApolloMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [indexStatus, setIndexStatus] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBackground, setWizardBackground] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState(null);
  const [wizardKey, setWizardKey] = useState('default');
  const [imageBatch, setImageBatch] = useState(() => getActiveImageBatch());
  const [remoteActive, setRemoteActive] = useState({ batches: [], locks: [] });
  const scrollRef = useRef(null);
  const wizardStopRef = useRef(null);

  useEffect(() => subscribeImageBatch(setImageBatch), []);

  useEffect(() => {
    if (!imageFixRequest?.products?.length) return;
    setWizardPrefill(imageFixRequest.products);
    setWizardKey(String(imageFixRequest.id || Date.now()));
    setWizardOpen(true);
    setWizardBackground(false);
    const count = imageFixRequest.products.length;
    const preview = imageFixRequest.products
      .slice(0, 4)
      .map((p) => p.title || p.name || p.sku)
      .join(', ');
    const suffix = count > 4 ? ` and ${count - 4} more` : '';
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: `Image fix for ${count} product${count === 1 ? '' : 's'}: ${preview}${suffix}.` },
    ]);
    onImageFixRequestHandled?.();
  }, [imageFixRequest?.id]);

  useEffect(() => {
    if (!isActive) return undefined;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/image-gen-costs?days=1&limit=5')
        .then((r) => r.json())
        .then((json) => {
          const me = getImageGenOperator();
          const others = (json.active?.batches || []).filter((b) => {
            if (!b.operator || b.operator === me) return false;
            const done = Number(b?.done || 0);
            const total = Number(b?.total || 0);
            const failed = Number(b?.failed || 0);
            const pending = total > 0 && done + failed < total;
            const fresh = Date.now() - new Date(b?.created_at || 0).getTime() < 20 * 60 * 1000;
            return pending && fresh;
          });
          setRemoteActive({ batches: others, locks: json.active?.locks?.length || 0 });
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 15000);
    return () => clearInterval(timer);
  }, [isActive]);

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

    if (!fix && /^\/image\s*$/i.test(trimmed)) {
      setInput('');
      setWizardOpen(true);
      setWizardBackground(false);
      return;
    }

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
        batchAction: json.batchAction || null,
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

  const fixLastReply = useCallback(() => {
    void send('', { fix: true });
  }, [send]);

  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === 'assistant' ? i : acc), -1);
  const showWelcome = messages.length === 0 && (!wizardOpen || wizardBackground);
  const showChat = !wizardOpen || wizardBackground;

  return (
    <div className="apollo-panel">
      {wizardOpen && (
        <div className="apollo-wizard-layer" style={{ display: wizardBackground ? 'none' : 'block' }}>
          <ApolloImageWizard
            key={wizardKey}
            taxonomyTree={taxonomyTree}
            prefillProducts={wizardPrefill}
            onExit={() => { setWizardOpen(false); setWizardBackground(false); setWizardPrefill(null); }}
            onRunInBackground={() => setWizardBackground(true)}
            onShowToast={onShowToast}
            onGoToApproval={() => { setWizardBackground(true); onGoToApproval?.(); }}
            onRefreshCatalog={onRefreshCatalog}
            stopRef={wizardStopRef}
          />
        </div>
      )}

      {wizardBackground && (
        <ImageBatchBanner
          batch={imageBatch}
          onOpenApproval={onGoToApproval}
          onBackToWizard={() => setWizardBackground(false)}
          onStop={() => wizardStopRef.current?.()}
        />
      )}

      <RemoteBatchNotice batches={remoteActive.batches} lockCount={remoteActive.locks} />

      {showChat && (
        <>
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
            <div className="apollo-head-actions">
              {wizardOpen && wizardBackground && (
                <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={() => setWizardBackground(false)}>
                  Image batch
                </button>
              )}
              {messages.length > 0 && (
                <button type="button" className="apollo-action-btn apollo-action-btn--ghost" onClick={clearChat} disabled={busy}>
                  Clear chat
                </button>
              )}
            </div>
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
              {!busy && messages.length > 0 && (
                <div className="apollo-composer-starters">
                  {STARTERS.slice(0, 3).map((s) => (
                    <button key={s} type="button" className="apollo-starter apollo-starter--compact" onClick={() => void send(s)} disabled={busy}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
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
                  placeholder="Ask Apollo anything — orders, stock, customers…  (/image for image gen)"
                  disabled={busy}
                />
                <button type="submit" className="apollo-send-btn" disabled={busy || !input.trim()} aria-label="Send">
                  {busy ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                </button>
              </form>
              <p className="apollo-composer-hint">Enter to send · Shift+Enter for a new line</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
