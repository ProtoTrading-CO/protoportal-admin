import { useCallback, useEffect, useState } from 'react';
import { BarChart2, Loader2, Mail } from 'lucide-react';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';

function formatPct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export default function EmailAnalyticsPanel({ onShowToast }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email-campaigns');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load email campaigns');
      setCampaigns(json.campaigns || []);
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load email analytics', 'error');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onRefresh = (event) => {
      if (event.detail === 'customers') void load();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  return (
    <div className="adm-list" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="adm-section-note" style={{ margin: 0 }}>
          Campaign sends are logged automatically. Open, click, and delivery stats update when Brevo webhooks hit <code>/api/brevo-email-webhook</code>.
        </p>
        {loading && <Loader2 size={16} className="spin" aria-label="Loading" />}
      </div>

      {campaigns.length === 0 && !loading && (
        <div className="adm-empty" style={{ padding: '32px 0' }}>
          <BarChart2 size={28} style={{ color: '#9ca3af', marginBottom: 8 }} />
          <div>No email campaigns logged yet. Use <strong>Send email</strong> to start tracking.</div>
        </div>
      )}

      {campaigns.map((campaign) => {
        const events = campaign.events || {};
        const sent = campaign.sent || campaign.recipientCount || 0;
        const delivered = events.delivered || 0;
        const opened = events.opened || 0;
        const clicked = events.clicked || 0;
        const bounced = events.bounced || 0;
        return (
          <div key={campaign.id} className="adm-card" style={{ marginBottom: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{campaign.subject || '(no subject)'}</div>
                <div className="adm-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {campaign.sentAt ? new Date(campaign.sentAt).toLocaleString('en-ZA') : '—'}
                  {' · '}
                  Audience: {campaign.audience || '—'}
                  {campaign.businessTypes?.length ? ` · Types: ${campaign.businessTypes.join(', ')}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                <Mail size={14} />
                {sent} sent{campaign.failed ? ` · ${campaign.failed} failed` : ''}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 14 }}>
              <Stat label="Delivered" value={delivered} hint={formatPct(delivered, sent)} />
              <Stat label="Opened" value={opened} hint={formatPct(opened, sent)} />
              <Stat label="Clicked" value={clicked} hint={formatPct(clicked, sent)} />
              <Stat label="Bounced" value={bounced} hint={formatPct(bounced, sent)} />
              {(events.unsubscribed || 0) > 0 && <Stat label="Unsubscribed" value={events.unsubscribed} hint={formatPct(events.unsubscribed, sent)} />}
              {(events.complained || 0) > 0 && <Stat label="Complaints" value={events.complained} hint={formatPct(events.complained, sent)} />}
            </div>
            <CampaignRecipients campaign={campaign} />
          </div>
        );
      })}
    </div>
  );
}

/** Who opened / clicked — expandable per-campaign recipient detail. */
function CampaignRecipients({ campaign }) {
  const [open, setOpen] = useState(false);
  const eventEmails = campaign.eventEmails || {};
  const clickedEmails = eventEmails.clicked || [];
  const openedEmails = eventEmails.opened || [];
  const bouncedEmails = eventEmails.bounced || [];
  const clickedLinks = campaign.clickedLinks || {};
  const hasDetail = clickedEmails.length || openedEmails.length || bouncedEmails.length || Object.keys(clickedLinks).length;
  if (!hasDetail) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        className="adm-btn-ghost adm-btn--sm"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Show'} who opened / clicked
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10, fontSize: 12 }}>
          {clickedEmails.length > 0 && (
            <RecipientList label={`Clicked (${clickedEmails.length})`} emails={clickedEmails} color="#15803d" />
          )}
          {Object.keys(clickedLinks).length > 0 && (
            <div>
              <div className="adm-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Links clicked</div>
              {Object.entries(clickedLinks).map(([url, info]) => (
                <div key={url} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{url} <span className="adm-muted">· {info.count} click(s)</span></div>
                  {info.emails?.length > 0 && (
                    <div className="adm-muted" style={{ wordBreak: 'break-word' }}>{info.emails.join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {openedEmails.length > 0 && (
            <RecipientList label={`Opened (${openedEmails.length})`} emails={openedEmails} color="#374151" />
          )}
          {bouncedEmails.length > 0 && (
            <RecipientList label={`Bounced (${bouncedEmails.length})`} emails={bouncedEmails} color="#b91c1c" />
          )}
        </div>
      )}
    </div>
  );
}

function RecipientList({ label, emails, color }) {
  return (
    <div>
      <div className="adm-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, color }}>{label}</div>
      <div style={{ wordBreak: 'break-word', lineHeight: 1.6 }}>{emails.join(', ')}</div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
      <div className="adm-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
      <div className="adm-muted" style={{ fontSize: 11 }}>{hint}</div>
    </div>
  );
}
