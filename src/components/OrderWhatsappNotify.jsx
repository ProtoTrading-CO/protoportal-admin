import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';

export default function OrderWhatsappNotify({ orderId }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    fetch(`/api/order-notify-log?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((data) => setLog(data))
      .catch(() => setLog({ found: false }))
      .finally(() => setLoading(false));
  }, [orderId]);

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
        No WhatsApp delivery log for this order yet.
      </div>
    );
  }

  const allFailed = log.failed > 0 && log.sent === 0;
  const partial = log.failed > 0 && log.sent > 0;
  const allOk = log.sent > 0 && log.failed === 0;
  const noToken = log.skippedNoToken;

  return (
    <div className={`oa-wa-notify${allFailed || noToken ? ' oa-wa-notify--err' : partial ? ' oa-wa-notify--warn' : ' oa-wa-notify--ok'}`}>
      <div className="oa-wa-notify-head">
        {allOk && <CheckCircle2 size={15} />}
        {(allFailed || partial || noToken) && <AlertTriangle size={15} />}
        <strong>Team WhatsApp</strong>
        <span className="oa-wa-notify-meta">
          {log.sent} sent · {log.failed} failed
          {log.at ? ` · ${new Date(log.at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>
      {noToken && (
        <p className="oa-wa-notify-msg">WATI_API_TOKEN is not configured — no team WhatsApp was sent.</p>
      )}
      {allFailed && !noToken && (
        <p className="oa-wa-notify-msg">
          WhatsApp failed for all team members. Order still moved to Handed Over because the order email was sent.
        </p>
      )}
      {partial && (
        <p className="oa-wa-notify-msg">Some team members did not receive WhatsApp. See errors below.</p>
      )}
      {allOk && (
        <p className="oa-wa-notify-msg">Fulfilment team notified via template <code>{log.template || 'proto_orders'}</code>.</p>
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
    </div>
  );
}
