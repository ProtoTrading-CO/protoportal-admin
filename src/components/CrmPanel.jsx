import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

async function fetchCrmContacts({ page, pageSize, search }) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) qs.set('search', search);
  const res = await fetch(`/api/crm-contacts?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'CRM load failed');
  return json;
}

export default function CrmPanel() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: queryKeys.crmContacts({ page, search: debouncedSearch }),
    queryFn: () => fetchCrmContacts({ page, pageSize: 50, search: debouncedSearch }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const showSkeleton = isLoading && !isPlaceholderData;

  return (
    <div className="crm-panel">
      <header className="adm-section-head">
        <div>
          <h2 className="adm-section-title"><Users size={20} /> CRM (Brevo)</h2>
          <p className="adm-section-note">
            Background-synced contacts — not live Brevo.
            {data?.lastSyncedAt && ` Last sync: ${new Date(data.lastSyncedAt).toLocaleString('en-ZA')}.`}
          </p>
        </div>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => refetch()}>
          {isFetching ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
        </button>
      </header>

      {data?.lastCampaignName && (
        <div className="crm-campaign-summary">
          <strong>Latest campaign:</strong> {data.lastCampaignName}
        </div>
      )}

      {data?.syncRequired && (
        <div className="adm-banner adm-banner--warn">{data.message}</div>
      )}

      <div className="adm-search-wrap" style={{ marginBottom: 16 }}>
        <Search size={16} />
        <input
          type="search"
          className="adm-search-input"
          placeholder="Search email or name…"
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
        />
      </div>

      {showSkeleton ? (
        <div className="pm-skeleton">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="pm-skeleton-row" />)}</div>
      ) : (
        <div className="adm-list">
          {rows.map((row) => (
            <div key={row.id || row.email} className="adm-list-row">
              <div className="adm-list-body">
                <strong>{row.name || row.email}</strong>
                <span className="adm-list-meta">{row.email}</span>
                {(row.list_names || []).length > 0 && (
                  <span className="adm-list-meta">Lists: {(row.list_names || []).join(', ')}</span>
                )}
              </div>
            </div>
          ))}
          {!rows.length && <p className="adm-empty">No CRM contacts synced yet.</p>}
        </div>
      )}

      {total > 50 && (
        <div className="adm-pager">
          <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page} · {total} contacts</span>
          <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
