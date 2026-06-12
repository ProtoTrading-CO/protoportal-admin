import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Bot, FileDown, Loader2, Send, Sparkles } from 'lucide-react';

const STARTERS = [
  'Summarise order activity this month',
  'What are customers searching for with no results?',
  'Show me a bar chart of top searches',
  'Any customers waiting for approval?',
];

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
        if (line.startsWith('## ')) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={i}>{line.slice(4)}</h4>;
        if (line.startsWith('- ')) return <p key={i} className="apollo-md-bullet">• {line.slice(2)}</p>;
        if (/^\d+\.\s/.test(line)) return <p key={i} className="apollo-md-bullet">{line}</p>;
        return line ? <p key={i}>{line}</p> : <br key={i} />;
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
            <div className="apollo-chart-fill" style={{ height: `${(values[i] / peak) * 100}%` }} />
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
  const plain = content.replace(/```chart[\s\S]*?```/g, '[Chart included in dashboard view]');
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

export default function ApolloPanel() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi — I\'m **Apollo**, your Proto admin assistant. I can analyse orders, customers, search trends, and products. Ask me anything, or pick a starter below.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || busy) return;
    setError('');
    setBusy(true);
    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');

    try {
      const apiMessages = nextMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(1)
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch('/api/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Apollo request failed');
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [busy, messages]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="apollo-panel">
      <div className="apollo-head">
        <div>
          <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={22} style={{ color: '#c40000' }} />
            Apollo
          </h2>
          <p className="adm-section-note">
            AI assistant with live access to orders, customers, search analytics, and catalogue data.
          </p>
        </div>
        {lastAssistant && (
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={() => exportMessagePdf(lastAssistant.content)}
          >
            <FileDown size={14} /> Export last reply as PDF
          </button>
        )}
      </div>

      <div className="apollo-starters">
        {STARTERS.map((s) => (
          <button key={s} type="button" className="apollo-starter" onClick={() => void send(s)} disabled={busy}>
            <Sparkles size={12} /> {s}
          </button>
        ))}
      </div>

      <div className="apollo-chat" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`apollo-msg apollo-msg--${msg.role}`}>
            <div className="apollo-msg-label">{msg.role === 'user' ? 'You' : 'Apollo'}</div>
            <div className="apollo-msg-body">
              {msg.role === 'assistant' ? <MessageBody content={msg.content} /> : <p>{msg.content}</p>}
            </div>
            {msg.role === 'assistant' && i > 0 && (
              <button type="button" className="apollo-pdf-link" onClick={() => exportMessagePdf(msg.content)}>
                <FileDown size={12} /> PDF
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="apollo-msg apollo-msg--assistant">
            <div className="apollo-msg-label">Apollo</div>
            <div className="apollo-msg-body apollo-thinking">
              <Loader2 size={16} className="spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      {error && <p className="oa-error">{error}</p>}

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
          placeholder="Ask Apollo about orders, searches, customers, products…"
          disabled={busy}
        />
        <button type="submit" className="adm-btn-red" disabled={busy || !input.trim()}>
          <Send size={16} /> Send
        </button>
      </form>
    </div>
  );
}
