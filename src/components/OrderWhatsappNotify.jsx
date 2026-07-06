import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw } from 'lucide-react';

export default function OrderWhatsappNotify({ orderId, orderStatus = '' }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const autoSentRef = useRef(false);

  const loadLog = () => {
    if (!orderId) return Promise.resolve();
    setLoading(true);
    return fetch(`/api/order-notify-log?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((data) => setLog(data))
      // loadError distinguishes "couldn't read the log" from "no log exists"
      // so a transient fetch failure never triggers the auto-send below.
      .catch(() => setLog({ found: false, loadError: true }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    autoSentRef.current = false;
    loadLog();
  }, [orderId]);

  // A brand-new order without any delivery log: fire the notification round
  // (team WhatsApp + alert email) automatically, once per order. Only for
  // orders still in "New" — expanding old orders must never re-ping the team,
  // and a failed log fetch (loadError) is not proof that no log exists.
  const isNewOrder = String(orderStatus || '').trim().toLowerCase() === 'pending';
  useEffect(() => {
    if (loading || retrying || autoSentRef.current) return;
    if (log && !log.found && !log.loadError && isNewOrder) {
      autoSentRef.current = true;
      void handleRetry();
    }
  }, [log, loading, isNewOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = async () => {
    setRetrying(true);
    setRetryMsg('');
    try {
      const resp = await fetch('/api/order-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setRetryMsg(data.error || 'Retry failed');
      } else if (data.ok) {
        setRetryMsg(`Sent to ${data.sent} team member(s)${data.emailSent ? ' and emailed online@proto.co.za' : ''}.`);
      } else {
        setRetryMsg(data.statusBlockedReason || 'Some team members did not receive WhatsApp.');
      }
      await loadLog();
    } catch {
      setRetryMsg('Retry request failed.');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="oa-wa-notify oa-wa-notify--loading">
        <Loader2 size={14} className="star-spinning" /> Checking WhatsApp delivery…
      </div>
    );
  }

  if (!log?.found) {
    return (
      <div className="oa-wa-notify oa-wa-notify--muted">
        <MessageCircle size={14} />
        {retrying ? 'Sending order notifications (team WhatsApp + email)…' : 'No delivery log for this order yet.'}
        <button type="button" className="oa-wa-notify-retry" onClick={handleRetry} disabled={retrying}>
          {retrying ? <Loader2 size={12} className="star-spinning" /> : <RefreshCw size={12} />}
          Send order notifications
        </button>
        {retryMsg && <p className="oa-wa-notify-msg">{retryMsg}</p>}
      </div>
    );
  }

  const allFailed = log.failed > 0 && log.sent === 0;
  const partial = log.failed > 0 && log.sent > 0;
  const allOk = log.sent > 0 && log.failed === 0 && log.ok;
  const noToken = log.skippedNoToken;
  const noTeam = log.skippedNoTeam;
  const blockedStatus = log.emailSent && !log.statusAdvanced && !log.advanceOnEmailOnly;

  return (
    <div className={`oa-wa-notify${allFailed || noToken || noTeam || blockedStatus ? ' oa-wa-notify--err' : partial ? ' oa-wa-notify--warn' : ' oa-wa-notify--ok'}`}>
      <div className="oa-wa-notify-head">
        {allOk && !blockedStatus && <CheckCircle2 size={15} />}
        {(allFailed || partial || noToken || noTeam || blockedStatus) && <AlertTriangle size={15} />}
        <strong>Team WhatsApp</strong>
        <span className="oa-wa-notify-meta">
          {log.sent}/{log.teamSize ?? log.sent} sent · {log.failed} failed
          {log.emailSent ? ' · email sent' : ' · email pending'}
          {log.at ? ` · ${new Date(log.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <button type="button" className="oa-wa-notify-retry" onClick={handleRetry} disabled={retrying} title="Resend team WhatsApp">
          {retrying ? <Loader2 size={12} className="star-spinning" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {noToken && (
        <p className="oa-wa-notify-msg">WATI_API_TOKEN is not configured — no team WhatsApp was sent.</p>
      )}
      {noTeam && !noToken && (
        <p className="oa-wa-notify-msg">No WhatsApp numbers in Team settings. Add team members under Order Requests → Team.</p>
      )}
      {blockedStatus && (
        <p className="oa-wa-notify-msg">
          Order email was sent but status stayed <strong>New</strong> because not all team WhatsApp messages were delivered.
          {log.statusBlockedReason ? ` ${log.statusBlockedReason}.` : ''}
        </p>
      )}
      {allFailed && !noToken && !noTeam && (
        <p className="oa-wa-notify-msg">
          WhatsApp failed for all {log.teamSize || 'team'} member(s) via <code>{log.template || 'proto_order_notis'}</code>
          {log.templateCategory ? ` (${log.templateCategory})` : ''}.
          {log.utilityTemplate === false
            ? ' UTILITY templates do not need an open chat session — check team numbers in Order Requests → Team and WATI template approval.'
            : ' Check team WhatsApp numbers in Order Requests → Team (placeholder numbers like 27821234501 will fail).'}
          {' '}You can retry below.
        </p>
      )}
      {partial && (
        <p className="oa-wa-notify-msg">Some team members did not receive WhatsApp. See errors below.</p>
      )}
      {allOk && !blockedStatus && log.marketingWarning && (
        <p className="oa-wa-notify-msg oa-wa-notify-msg--warn">{log.marketingWarning}</p>
      )}
      {allOk && !blockedStatus && !log.marketingWarning && (
        <p className="oa-wa-notify-msg">
          All {log.teamSize || log.sent} team member(s) notified via <code>{log.template || 'proto_order_notis'}</code>.
          {log.statusAdvanced ? ' Order moved to Handed Over.' : ''}
        </p>
      )}
      {log.failedList?.length > 0 && (
        <ul className="oa-wa-notify-errors">
          {log.failedList.map((f) => (
            <li key={`${f.phone}-${f.name}`}>
              <strong>{f.name || 'Team member'}</strong> ({f.phone}): {f.error}
            </li>
          ))}
        </ul>
      )}
      {retryMsg && <p className="oa-wa-notify-msg">{retryMsg}</p>}
    </div>
  );
}
