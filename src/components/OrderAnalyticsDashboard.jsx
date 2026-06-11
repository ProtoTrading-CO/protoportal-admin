import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

const PERIODS = [7, 30, 90, 120];

function money(n) {
  return `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function HorizontalBars({ rows, valueKey = 'qty', labelKey = 'name', fallbackLabelKey, max = 10 }) {
  const data = (rows || []).slice(0, max);
  const peak = Math.max(1, ...data.map((r) => Number(r[valueKey] || r.views || 0)));
  if (!data.length) return <p className="oa-empty">No data for this period.</p>;
  return (
    <div className="oa-hbars">
      {data.map((row) => {
        const val = Number(row[valueKey] ?? row.views ?? row.qty ?? 0);
        const label = row[labelKey] || row[fallbackLabelKey] || row.label || row.code || '—';
        return (
          <div key={`${label}-${val}`} className="oa-hbar-row">
            <span className="oa-hbar-label" title={label}>{label}</span>
            <div className="oa-hbar-track">
              <div className="oa-hbar-fill" style={{ width: `${(val / peak) * 100}%` }} />
            </div>
            <span className="oa-hbar-val">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ slices }) {
  const data = (slices || []).filter((s) => s.count > 0);
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return <p className="oa-empty">No data for this period.</p>;

  const colors = ['#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#64748b'];
  let offset = 0;
  const segments = data.map((slice, i) => {
    const pct = slice.count / total;
    const dash = `${pct * 100} ${100 - pct * 100}`;
    const seg = { ...slice, dash, offset, color: colors[i % colors.length], pct };
    offset += pct * 100;
    return seg;
  });

  return (
    <div className="oa-donut-wrap">
      <svg viewBox="0 0 42 42" className="oa-donut">
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx="21"
            cy="21"
            r="15.915"
            fill="transparent"
            stroke={seg.color}
            strokeWidth="4"
            strokeDasharray={seg.dash}
            strokeDashoffset={25 - seg.offset}
          />
        ))}
      </svg>
      <ul className="oa-donut-legend">
        {segments.map((seg) => (
          <li key={seg.label}>
            <span className="oa-dot" style={{ background: seg.color }} />
            <span>{seg.label}</span>
            <strong>{seg.count}</strong>
            <span className="oa-muted">{Math.round(seg.pct * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimeBars({ rows, valueKey = 'orders' }) {
  if (!rows?.length) return <p className="oa-empty">No orders in this period.</p>;
  const peak = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return (
    <div className="oa-time-bars">
      {rows.map((row) => (
        <div key={row.label || row.date} className="oa-time-bar-col" title={`${row.label}: ${row[valueKey]}`}>
          <div className="oa-time-bar-fill" style={{ height: `${((row[valueKey] || 0) / peak) * 100}%` }} />
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function OrderAnalyticsDashboard() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/order-analytics?period=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load analytics');
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const summary = data?.summary;

  const peakDay = useMemo(() => {
    if (!data?.peakByDay?.length) return null;
    return [...data.peakByDay].sort((a, b) => b.orders - a.orders)[0];
  }, [data]);

  const peakHour = useMemo(() => {
    if (!data?.peakByHour?.length) return null;
    return [...data.peakByHour].sort((a, b) => b.orders - a.orders)[0];
  }, [data]);

  return (
    <div className="oa-dashboard">
      <div className="oa-toolbar">
        <div className="oa-periods">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              className={`oa-period-btn${period === d ? ' oa-period-btn--active' : ''}`}
              onClick={() => setPeriod(d)}
            >
              {d} days
            </button>
          ))}
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 size={15} className="star-spinning" /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>

      {error && <div className="oa-error">{error}</div>}
      {loading && !data && (
        <div className="oa-loading"><Loader2 size={28} className="star-spinning" /></div>
      )}

      {summary && (
        <>
          <div className="oa-stat-grid">
            <div className="oa-stat-card"><div className="oa-stat-val">{summary.totalOrders}</div><div className="oa-stat-label">Total Orders</div></div>
            <div className="oa-stat-card oa-stat-card--accent"><div className="oa-stat-val">{money(summary.totalRevenue)}</div><div className="oa-stat-label">Total Revenue</div></div>
            <div className="oa-stat-card"><div className="oa-stat-val">{money(summary.avgOrderValue)}</div><div className="oa-stat-label">Average Order Value</div></div>
            <div className="oa-stat-card"><div className="oa-stat-val">{summary.customersWhoOrdered}</div><div className="oa-stat-label">Customers Who Ordered</div></div>
          </div>

          <section className="oa-panel">
            <h3>Orders Over Time</h3>
            <TimeBars rows={data.ordersOverTime} valueKey="orders" />
          </section>

          <div className="oa-split">
            <section className="oa-panel">
              <h3>Most Ordered Items</h3>
              <HorizontalBars rows={data.topOrderedProducts} valueKey="qty" labelKey="name" fallbackLabelKey="code" />
            </section>
            <section className="oa-panel">
              <h3>Most Ordered Categories</h3>
              <DonutChart slices={data.topOrderedCategories?.map((c) => ({ label: c.label, count: c.qty }))} />
            </section>
          </div>

          <div className="oa-split">
            <section className="oa-panel">
              <h3>Most Viewed Products</h3>
              {!data.trackingEnabled && <p className="oa-note">Product view tracking activates after the portal migration is applied.</p>}
              <HorizontalBars rows={data.topViewedProducts} valueKey="views" labelKey="label" />
            </section>
            <section className="oa-panel">
              <h3>Most Viewed Categories</h3>
              {!data.trackingEnabled && <p className="oa-note">Category view tracking activates after the portal migration is applied.</p>}
              <DonutChart slices={data.topViewedCategories?.map((c) => ({ label: c.label, count: c.views }))} />
            </section>
          </div>

          <div className="oa-split">
            <section className="oa-panel">
              <h3>Order Status Breakdown</h3>
              <DonutChart slices={data.orderStatusBreakdown} />
            </section>
            <section className="oa-panel">
              <h3>Peak Order Times</h3>
              <div className="oa-peak-grid">
                <div>
                  <div className="oa-subhead">By day of week</div>
                  <HorizontalBars rows={data.peakByDay?.map((d) => ({ name: d.day, qty: d.orders }))} valueKey="qty" labelKey="name" max={7} />
                </div>
                <div>
                  <div className="oa-subhead">By hour</div>
                  <div className="oa-hour-bars">
                    {data.peakByHour?.map((h) => {
                      const peak = Math.max(1, ...data.peakByHour.map((x) => x.orders));
                      return (
                        <div key={h.hour} className="oa-hour-col" title={`${h.hour}:00 — ${h.orders} orders`}>
                          <div className="oa-hour-fill" style={{ height: `${(h.orders / peak) * 100}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="oa-peak-hint">
                    {peakDay && peakHour ? (
                      <>Busiest: <strong>{peakDay.day}</strong> · peak hour <strong>{String(peakHour.hour).padStart(2, '0')}:00</strong></>
                    ) : '—'}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="oa-panel">
            <h3>Additional Insights</h3>
            <div className="oa-insights-row">
              <div className="oa-insight-card">
                <div className="oa-insight-val">{summary.repeatCustomerPct}%</div>
                <div className="oa-insight-label">Repeat customers (of those who ordered)</div>
              </div>
              <div className="oa-insight-card">
                <div className="oa-insight-val">{100 - summary.repeatCustomerPct}%</div>
                <div className="oa-insight-label">First-time order share</div>
              </div>
            </div>
          </section>

          <section className="oa-panel">
            <h3>Top Customers</h3>
            {!data.topCustomers?.length ? (
              <p className="oa-empty">No customer orders in this period.</p>
            ) : (
              <div className="oa-table-wrap">
                <table className="oa-table">
                  <thead>
                    <tr><th>Customer</th><th>Email</th><th>Orders</th><th>Spend</th></tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.email}</td>
                        <td>{c.orders}</td>
                        <td>{money(c.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
