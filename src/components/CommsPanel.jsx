import { useCallback, useEffect, useState, Suspense } from 'react';
import { BarChart2, ChevronLeft, ChevronRight, Loader2, Mail, RefreshCw, Search, Users } from 'lucide-react';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';
import { lazyRetry } from '../lib/lazyRetry';

const EmailAnalyticsPanel = lazyRetry(() => import('./EmailAnalyticsPanel'));

const PAGE_SIZE = 50;

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function listNames(contact) {
  const names = Array.isArray(contact?.list_names) ? contact.list_names : [];
  return names.filter(Boolean).join(', ');
}

/**
 * Email CRM (comms) — one place for customer email work: Brevo-synced contacts,
 * the existing broadcast composer (opened via onCompose), and campaign
 * analytics. Assembles existing pieces; adds no new Brevo calls — contacts come
 * from the background-synced crm_contacts cache (api/brevo-sync.js cron).
 */
export default function CommsPanel({ onCompose, onShowToast }) {
  const [tab, setTab] = useState('contacts');
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadContacts = useCallback(async (pageArg, searchArg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageArg), pageSize: String(PAGE_SIZE) });
      if (searchArg) params.set('search', searchArg);
      const res = await fetch(`/api/crm-contacts?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load contacts');
      setContacts(json.rows || []);
      setTotal(Number(json.total || 0));
      setLastSyncedAt(json.lastSyncedAt || null);
      setSyncNote(json.syncRequired ? (json.message || 'Contact sync is not set up yet.') : '');
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load contacts', 'error');
      setContacts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { setPage(1); }, [searchDebounced]);
  useEffect(() => { void loadContacts(page, searchDebounced); }, [page, searchDebounced, loadContacts]);

  useEffect(() => {
    const onRefresh = (event) => {
      if (event.detail === 'comms') void loadContacts(page, searchDebounced);
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [loadContacts, page, searchDebounced]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lastSynced = lastSyncedAt;

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Email CRM</h2>
          <p className="adm-section-note">
            Compose and send campaigns, browse Brevo-synced contacts, and track opens and clicks — all in one place.
            Contacts sync automatically every 15 minutes{lastSynced ? ` (last: ${formatWhen(lastSynced)})` : ''}.
          </p>
        </div>
        <button type="button" className="adm-btn-red" onClick={() => onCompose?.()}>
          <Mail size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
          Compose email
        </button>
      </div>

      <div className="adm-customer-tabs" style={{ marginBottom: 12 }}>
        <button type="button" onClick={() => setTab('contacts')} className={`adm-tab${tab === 'contacts' ? ' adm-tab--active' : ''}`}>
          <Users size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Contacts{total ? ` (${total})` : ''}
        </button>
        <button type="button" onClick={() => setTab('analytics')} className={`adm-tab${tab === 'analytics' ? ' adm-tab--active' : ''}`}>
          <BarChart2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Email Analytics
        </button>
        {tab === 'contacts' && (
          <>
            <label className="adm-search adm-search--inline">
              <Search size={14} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or name…" className="adm-search-input" />
            </label>
            <button
              type="button"
              className="adm-btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => void loadContacts(page, searchDebounced)}
              disabled={loading}
              title="Reload contacts"
            >
              {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            </button>
          </>
        )}
      </div>

      {tab === 'analytics' ? (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 4px', color: '#6b7280', fontSize: 13 }}><Loader2 size={16} className="spin" /> Loading Email Analytics…</div>}>
          <EmailAnalyticsPanel onShowToast={onShowToast} />
        </Suspense>
      ) : (
        <>
          <div className="adm-list">
            <div className="adm-list-head" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.1fr 110px 110px 110px' }}>
              <span>Email</span><span>Name</span><span>Lists</span><span>Last campaign</span><span>Last sent</span><span>Last open</span><span>Last click</span>
            </div>
            {contacts.map((contact) => (
              <div key={contact.id || contact.email} className="adm-list-row" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.1fr 110px 110px 110px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{contact.email}</div>
                <div style={{ fontSize: 13 }}>{contact.name || <span className="adm-muted">—</span>}</div>
                <div className="adm-muted" style={{ fontSize: 12 }}>{listNames(contact) || '—'}</div>
                <div style={{ fontSize: 12 }}>{contact.last_campaign_name || <span className="adm-muted">—</span>}</div>
                <div className="adm-muted" style={{ fontSize: 12 }}>{formatWhen(contact.last_sent_at)}</div>
                <div style={{ fontSize: 12, color: contact.last_open_at ? '#15803d' : undefined }} className={contact.last_open_at ? undefined : 'adm-muted'}>{formatWhen(contact.last_open_at)}</div>
                <div style={{ fontSize: 12, color: contact.last_click_at ? '#15803d' : undefined }} className={contact.last_click_at ? undefined : 'adm-muted'}>{formatWhen(contact.last_click_at)}</div>
              </div>
            ))}
            {!loading && contacts.length === 0 && (
              <div style={{ padding: '20px 16px', color: '#6b7280', fontSize: 13 }}>
                {syncNote
                  || (searchDebounced
                    ? 'No contacts match your search.'
                    : 'No synced contacts yet. The Brevo sync cron fills this list automatically (api/brevo-sync every 15 min).')}
              </div>
            )}
            {loading && contacts.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', color: '#6b7280', fontSize: 13 }}>
                <Loader2 size={16} className="spin" /> Loading contacts…
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button type="button" className="adm-btn-ghost" style={{ padding: '4px 10px' }} disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              <span className="adm-muted" style={{ fontSize: 12 }}>Page {page} of {totalPages}</span>
              <button type="button" className="adm-btn-ghost" style={{ padding: '4px 10px' }} disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
