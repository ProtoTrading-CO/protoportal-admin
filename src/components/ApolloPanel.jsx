import { useCallback, useEffect, useRef, useState } from 'react';
import { displayNameFromEmail } from '../lib/apolloTodayPresentation.js';
import { getVerifiedSession } from '../lib/auth.js';
import ApolloCommandCentre from './ApolloCommandCentre.jsx';

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
  const [userName, setUserName] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const proposedActionRef = useRef(null);

  useEffect(() => {
    void getVerifiedSession().then((session) => {
      const email = session?.user?.email || null;
      const name = displayNameFromEmail(email);
      if (email) setUserEmail(email);
      if (name) setUserName(name);
    });
  }, []);

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
    try {
      sessionStorage.setItem(APOLLO_STORAGE_KEY, JSON.stringify(messages));
    } catch { /* quota */ }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    proposedActionRef.current = null;
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
      const apiMessages = nextMessages.map(({ role, content, intent }) => ({ role, content, intent: intent || null }));
      const lastAssistant = [...nextMessages].reverse().find((m) => m.role === 'assistant');
      const res = await fetch('/api/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          fix,
          badReply,
          previousIntent,
          proposedAction: proposedActionRef.current,
          conversationContext: {
            messages: apiMessages.slice(-8),
            proposedAction: proposedActionRef.current,
            lastIntent: lastAssistant?.intent || previousIntent || null,
          },
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
        proposedAction: json.proposedAction || null,
      };

      if (json.intent === 'order_workspace_cancelled') {
        proposedActionRef.current = null;
      } else if (json.proposedAction) {
        proposedActionRef.current = json.proposedAction;
      }

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

  const reviewNotification = useCallback(async (item, review) => {
    if (!item?.notificationDbId || !review?.feedback) return;
    try {
      const res = await fetch('/api/apollo-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.notificationDbId,
          feedback: review.feedback,
          businessValue: review.businessValue || undefined,
          decisionOutcome: review.decisionOutcome || undefined,
          note: review.note || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(formatErrorMessage(json?.error, 'Could not record feedback'));
      onShowToast?.('Apollo feedback recorded', 'success');
      await loadIndexStatus(true);
    } catch (err) {
      onShowToast?.(formatErrorMessage(err, 'Could not record Apollo feedback'), 'error');
    }
  }, [loadIndexStatus, onShowToast]);

  const fixLastReply = useCallback(() => {
    void send('', { fix: true });
  }, [send]);

  const briefContext = indexStatus?.brief?.context;
  const briefMeta = indexStatus?.brief?.meta;
  const briefLoading = !indexStatus && !indexError;

  return (
    <div className="apollo-panel apollo-panel--command-centre">
      <ApolloCommandCentre
        briefContext={briefContext}
        briefMeta={briefMeta}
        briefLoading={briefLoading}
        indexError={indexError}
        indexStatus={indexStatus}
        rebuildingIndex={rebuildingIndex}
        onRefreshBrief={() => void rebuildIndex()}
        onReviewNotification={(item, review) => void reviewNotification(item, review)}
        userName={userName}
        userEmail={userEmail}
        messages={messages}
        chatInput={input}
        onChatInputChange={setInput}
        onSend={send}
        chatBusy={busy}
        chatError={error}
        onFixLast={fixLastReply}
        onClearChat={clearChat}
        onShowToast={onShowToast}
      />
    </div>
  );
}
