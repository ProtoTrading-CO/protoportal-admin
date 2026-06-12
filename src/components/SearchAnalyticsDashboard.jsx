import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { downloadCsv } from '../lib/exportReport';

const PERIODS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
  { days: 0, label: 'All time' },
];

function money(n) {
  return `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function todayTag() {
  return new Date().toISOString().slice(0, 10);
}

function PanelHeader({ title, onExport, exportLabel = 'Export CSV' }) {
  return (
    <div className="oa-panel-head">
      <h3>{title}</h3>
      {onExport && (
        <button type="button" className="oa-export-btn" onClick={onExport}>
          <Download size={14} />
          {exportLabel}
        </button>
      )}
    </div>
  );
}

function TimeBars({ rows, valueKey = 'searches' }) {
  if (!rows?.length) return <p className="oa-empty">No data yet.</p>;
  const peak = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return (
    <div className="oa-time-bars">
      {rows.map((row) => (
        <div key={row.date || row.label} className="oa-time-bar-col" title={`${row.label}: ${row[valueKey]}`}>
          <div className="oa-time-bar-fill" style={{ height: `${((row[valueKey] || 0) / peak) * 100}%` }} />
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

function FunnelBars({ funnel }) {
  if (!funnel?.total) return <p className="oa-empty">No searches in this period.</p>;
  const stages = [
    { label: 'Searches', value: funnel.total },
    { label: 'Clicks', value: funnel.clicks },
    { label: 'Added to cart', value: funnel.cart },
    { label: 'Orders', value: funnel.orders },
  ];
  const peak = Math.max(1, funnel.total);
  let prev = funnel.total;
  return (
    <div className="oa-hbars sa-funnel">
      {stages.map((stage, idx) => {
        const drop = idx > 0 && prev > 0 ? Math.round((1 - stage.value / prev) * 100) : 0;
        const dropLabel = idx === 0 ? '' : ` (−${drop}%)`;
        if (idx > 0) prev = stage.value;
        return (
          <div key={stage.label} className="oa-hbar-row">
            <span className="oa-hbar-label">{stage.label}</span>
            <div className="oa-hbar-track">
              <div className="oa-hbar-fill" style={{ width: `${(stage.value / peak) * 100}%` }} />
            </div>
            <span className="oa-hbar-val">{stage.value}{dropLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClickPositionBars({ rows }) {
  const data = rows || [];
  if (!data.length) return <p className="oa-empty">No click data yet.</p>;
  const peak = Math.max(1, ...data.map((r) => Number(r.avg_position || 0)));
  return (
    <div className="oa-hbars">
      {data.map((row) => {
        const pos = Number(row.avg_position || 0);
        const color = pos <= 3 ? '#16a34a' : pos <= 7 ? '#d97706' : '#dc2626';
        return (
          <div key={row.normalized_search_term} className="oa-hbar-row">
            <span className="oa-hbar-label" title={row.normalized_search_term}>{row.normalized_search_term}</span>
            <div className="oa-hbar-track">
              <div className="oa-hbar-fill" style={{ width: `${(pos / peak) * 100}%`, background: color }} />
            </div>
            <span className="oa-hbar-val">{pos}</span>
          </div>
        );
      })}
    </div>
  );
}

function DataTable({ columns, rows, emptyLabel = 'No data yet.' }) {
  if (!rows?.length) return <p className="oa-empty">{emptyLabel}</p>;
  return (
    <div className="oa-table-wrap">
      <table className="oa-table">
        <thead>
          <tr>
            {columns.map((col) => <th key={col.key || col.header}>{col.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || `${i}-${row.normalized_search_term || row.search_term}`}>
              {columns.map((col) => (
                <td key={col.key || col.header}>
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SearchAnalyticsDashboard() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [queueBusy, setQueueBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ period: String(period) });
      if (showAllQueue) qs.set('showAllQueue', '1');
      const res = await fetch(`/api/search-analytics-dashboard?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load search analytics');
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, showAllQueue]);

  useEffect(() => { void load(); }, [load]);

  const kpis = data?.kpis;
  const dateTag = todayTag();

  const updateQueueStatus = async (id, status) => {
    setQueueBusy(id);
    try {
      const res = await fetch('/api/search-analytics-dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setQueueBusy(null);
    }
  };

  const exportTopSearches = () => {
    downloadCsv(`proto-top-searches-${dateTag}.csv`, [
      { header: 'Term', key: 'normalized_search_term' },
      { header: 'Searches', key: 'searches' },
      { header: 'Orders', key: 'orders' },
      { header: 'Conversion %', key: 'conversion' },
    ], data?.topSearches || []);
  };

  const exportNoResults = () => {
    downloadCsv(`proto-no-results-${dateTag}.csv`, [
      { header: 'Term', key: 'normalized_search_term' },
      { header: 'Count', key: 'search_count' },
    ], data?.zeroResultTerms || []);
  };

  const exportLeadsToOrders = () => {
    downloadCsv(`proto-searches-to-orders-${dateTag}.csv`, [
      { header: 'Term', key: 'normalized_search_term' },
      { header: 'Searches', key: 'searches' },
      { header: 'Orders', key: 'orders' },
      { header: 'Conversion %', key: 'conversion' },
    ], data?.searchesToOrders || []);
  };

  const exportNoOrders = () => {
    downloadCsv(`proto-zero-order-terms-${dateTag}.csv`, [
      { header: 'Term', key: 'normalized_search_term' },
      { header: 'Searches', key: 'searches' },
    ], data?.zeroOrderTerms || []);
  };

  const exportCustomerHistory = () => {
    downloadCsv(`proto-customer-search-history-${dateTag}.csv`, [
      { header: 'Customer', value: (r) => r.customer_email || 'Guest' },
      { header: 'Term', key: 'search_term' },
      { header: 'Date', value: (r) => new Date(r.created_at).toLocaleString('en-ZA') },
      { header: 'Results', key: 'results_found' },
    ], data?.customerHistory || []);
  };

  const exportActionQueue = () => {
    downloadCsv(`proto-action-queue-${dateTag}.csv`, [
      { header: 'Term', key: 'search_term' },
      { header: 'Flag reason', key: 'flag_reason' },
      { header: 'Search count', key: 'search_count' },
      { header: 'Status', key: 'status' },
    ], data?.actionQueue || []);
  };

  const customerRows = useMemo(
    () => (data?.customerHistory || []).map((row) => ({
      ...row,
      customer_label: row.customer_email || 'Guest',
    })),
    [data],
  );

  return (
    <div className="oa-dashboard sa-dashboard">
      <div className="oa-toolbar">
        <div className="oa-periods">
          {PERIODS.map(({ days, label }) => (
            <button
              key={label}
              type="button"
              className={`oa-period-btn${period === days ? ' oa-period-btn--active' : ''}`}
              onClick={() => setPeriod(days)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="oa-export-btn" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && <p className="oa-error">{error}</p>}

      {loading && !data ? (
        <div className="oa-loading"><Loader2 size={20} className="spin" /> Loading search analytics…</div>
      ) : (
        <>
          <div className="oa-stat-grid sa-stat-grid--5">
            <div className="oa-stat-card">
              <div className="oa-stat-val">{kpis?.totalSearches ?? 0}</div>
              <div className="oa-stat-label">Total searches</div>
            </div>
            <div className="oa-stat-card">
              <div className="oa-stat-val">{kpis?.uniqueTerms ?? 0}</div>
              <div className="oa-stat-label">Unique terms</div>
            </div>
            <div className="oa-stat-card oa-stat-card--accent">
              <div className="oa-stat-val">{kpis?.searchesWithResults ?? 0}</div>
              <div className="oa-stat-label">With results</div>
            </div>
            <div className="oa-stat-card">
              <div className="oa-stat-val">{kpis?.searchesNoResults ?? 0}</div>
              <div className="oa-stat-label">No results</div>
            </div>
            <div className="oa-stat-card">
              <div className="oa-stat-val">{kpis?.conversionPct ?? 0}%</div>
              <div className="oa-stat-label">Search → order</div>
            </div>
          </div>

          <div className="oa-panel">
            <PanelHeader title="Search volume over time" />
            <TimeBars rows={data?.volumeByDay || []} valueKey="searches" />
          </div>

          <div className="oa-split">
            <div className="oa-panel">
              <PanelHeader title="Search funnel" />
              <FunnelBars funnel={data?.funnel} />
            </div>
            <div className="oa-panel oa-stat-card oa-stat-card--accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="oa-stat-val">{money(kpis?.revenue)}</div>
              <div className="oa-stat-label">Revenue attributed to search</div>
              <p className="oa-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                Sum of order value where search led to an order.
              </p>
            </div>
          </div>

          <div className="oa-split">
            <div className="oa-panel">
              <PanelHeader title="Top searches" onExport={exportTopSearches} />
              <DataTable
                columns={[
                  { header: 'Term', key: 'normalized_search_term' },
                  { header: 'Count', key: 'searches' },
                  { header: 'Conv %', render: (r) => `${r.conversion ?? 0}%` },
                ]}
                rows={data?.topSearches || []}
              />
            </div>
            <div className="oa-panel">
              <PanelHeader title="Avg click position (top 10)" />
              <ClickPositionBars rows={data?.avgClickPosition || []} />
            </div>
          </div>

          <div className="oa-panel">
            <PanelHeader title="Searches with no results" onExport={exportNoResults} />
            <DataTable
              columns={[
                { header: 'Term', key: 'normalized_search_term' },
                { header: 'Count', key: 'search_count' },
                {
                  header: 'Flag',
                  render: (r) => (
                    Number(r.search_count) >= 10
                      ? <span className="sa-badge sa-badge--amber">Action needed</span>
                      : '—'
                  ),
                },
              ]}
              rows={data?.zeroResultTerms || []}
            />
          </div>

          <div className="oa-panel">
            <PanelHeader title="Searches leading to orders" onExport={exportLeadsToOrders} />
            <DataTable
              columns={[
                { header: 'Term', key: 'normalized_search_term' },
                { header: 'Searches', key: 'searches' },
                { header: 'Orders', key: 'orders' },
                { header: 'Conv %', render: (r) => `${r.conversion ?? 0}%` },
              ]}
              rows={data?.searchesToOrders || []}
            />
          </div>

          <div className="oa-panel">
            <PanelHeader title="Searches with no orders" onExport={exportNoOrders} />
            <DataTable
              columns={[
                { header: 'Term', key: 'normalized_search_term' },
                { header: 'Searches', key: 'searches' },
                { header: 'Orders', render: () => '0' },
                { header: 'Conv %', render: () => '0%' },
                {
                  header: 'Flag',
                  render: (r) => (
                    Number(r.searches) >= 20
                      ? <span className="sa-badge sa-badge--red">No sales</span>
                      : '—'
                  ),
                },
              ]}
              rows={data?.zeroOrderTerms || []}
            />
          </div>

          <div className="oa-panel">
            <PanelHeader title="Customer search history" onExport={exportCustomerHistory} />
            <DataTable
              columns={[
                { header: 'Customer', render: (r) => r.customer_email || 'Guest' },
                { header: 'Term', key: 'search_term' },
                { header: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-ZA') },
                { header: 'Results', key: 'results_found' },
              ]}
              rows={customerRows}
            />
          </div>

          <div className="oa-panel">
            <PanelHeader title="Products customers wanted but couldn't find" />
            <DataTable
              columns={[
                { header: 'Term', key: 'normalized_search_term' },
                { header: 'Search count', key: 'search_count' },
              ]}
              rows={data?.wantedNotFound || []}
              emptyLabel="No zero-result searches yet."
            />
          </div>

          <div className="oa-panel">
            <div className="oa-panel-head">
              <h3>Catalogue action queue</h3>
              <div className="oa-panel-actions">
                <label className="sa-toggle">
                  <input
                    type="checkbox"
                    checked={showAllQueue}
                    onChange={(e) => setShowAllQueue(e.target.checked)}
                  />
                  Show all
                </label>
                <button type="button" className="oa-export-btn" onClick={exportActionQueue}>
                  <Download size={14} />
                  Export CSV
                </button>
              </div>
            </div>
            <DataTable
              columns={[
                { header: 'Term', key: 'search_term' },
                { header: 'Flag reason', key: 'flag_reason' },
                { header: 'Search count', key: 'search_count' },
                { header: 'Status', key: 'status' },
                {
                  header: 'Actions',
                  render: (r) => (
                    r.status === 'open' ? (
                      <div className="sa-queue-actions">
                        <button
                          type="button"
                          className="oa-export-btn"
                          disabled={queueBusy === r.id}
                          onClick={() => void updateQueueStatus(r.id, 'actioned')}
                        >
                          Mark actioned
                        </button>
                        <button
                          type="button"
                          className="oa-export-btn"
                          disabled={queueBusy === r.id}
                          onClick={() => void updateQueueStatus(r.id, 'dismissed')}
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : '—'
                  ),
                },
              ]}
              rows={data?.actionQueue || []}
              emptyLabel="No open tasks."
            />
          </div>
        </>
      )}
    </div>
  );
}
