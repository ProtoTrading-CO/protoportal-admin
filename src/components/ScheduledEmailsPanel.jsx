import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, RefreshCw, X, XCircle } from 'lucide-react';
import { cancelScheduledEmail, fetchScheduledEmails } from '../lib/customers';

const STATUS_META = {
  pending: { label: 'Scheduled', color: '#b45309', bg: '#fef3c7' },
  sending: { label: 'Sending…', color: '#1d4ed8', bg: '#dbeafe' },
  sent: { label: 'Sent', color: '#15803d', bg: '#dcfce7' },
  failed: { label: 'Failed', color: '#b91c1c', bg: '#fee2e2' },
};

const AUDIENCE_LABELS = {
  'all-approved': 'Approved trade customers',
  requests: 'Trade requests',
  'proto-active': 'Pre-registration',
  'all-portal': 'Approved + Pre-registration',
  regular: 'Approved customers',
};

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ScheduledEmailsPanel({ onShowToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchScheduledEmails());
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load scheduled emails', 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load]);

  // While a send is due/in-flight, poll so the result (including any failures)
  // appears without a manual reload. Stops once nothing is pending/sending.
  const hasActive = items.some((i) => i.status === 'pending' || i.status === 'sending');
  useEffect(() => {
    if (!hasActive) return undefined;
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [hasActive, load]);

  const handleCancel = async (item) => {
    if (!window.confirm(`Cancel the scheduled email "${item.subject}"?`)) return;
    setCancelling(item.id);
    try {
      await cancelScheduledEmail(item.id);
      onShowToast?.('Scheduled email cancelled');
      await load();
    } catch (err) {
      onShowToast?.(err.message || 'Cancel failed', 'error');
    } finally {
      setCancelling('');
    }
  };

  return (
    <div className="adm-list" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="adm-section-note" style={{ margin: 0 }}>
          Queued email broadcasts. The scheduler checks every 10 minutes, so sends fire within 10 minutes of their time.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <Loader2 size={16} className="spin" aria-label="Loading" />}
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {items.length === 0 && !loading && (
        <div className="adm-empty" style={{ padding: '32px 0' }}>
          <CalendarClock size={28} style={{ color: '#9ca3af', marginBottom: 8 }} />
          <div>No scheduled emails. Use <strong>Send email → Schedule send</strong> to queue one.</div>
        </div>
      )}

      {items.map((item) => {
        const meta = STATUS_META[item.status] || STATUS_META.pending;
        return (
          <div key={item.id} className="adm-list-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 110px 120px', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{item.subject}</div>
              <div className="adm-muted" style={{ fontSize: 11 }}>{AUDIENCE_LABELS[item.audience] || item.audience}{item.businessTypes?.length ? ` · ${item.businessTypes.join(', ')}` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatWhen(item.scheduledAt)}</div>
              <div className="adm-muted" style={{ fontSize: 11 }}>scheduled for</div>
            </div>
            <div>
              {item.status === 'sent' && item.result ? (
                <div style={{ fontSize: 12, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={13} /> {item.result.sent}/{item.result.total} sent{item.result.failed ? `, ${item.result.failed} failed` : ''}
                </div>
              ) : item.status === 'failed' ? (
                <div style={{ fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <XCircle size={13} /> {item.error || 'Send failed'}
                </div>
              ) : (
                <span className="adm-muted" style={{ fontSize: 12 }}>—</span>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 4, padding: '3px 8px', textAlign: 'center' }}>
              {meta.label}
            </span>
            <div>
              {item.status === 'pending' && (
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn--sm"
                  style={{ color: '#c40000' }}
                  disabled={cancelling === item.id}
                  onClick={() => void handleCancel(item)}
                >
                  {cancelling === item.id ? <Loader2 size={13} className="spin" /> : <X size={13} />} Cancel
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
