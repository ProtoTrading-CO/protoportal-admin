import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, Loader2, RefreshCw, Users, Zap } from 'lucide-react';
import { getImageGenOperator, setImageGenOperator } from '../lib/imageGenSession';

const randFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatZar(v) {
  return randFormatter.format(Number(v) || 0);
}

function formatUsd(v) {
  return usdFormatter.format(Number(v) || 0);
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CostTrackingPanel({ onShowToast }) {
  const [operator, setOperator] = useState(() => getImageGenOperator());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/image-gen-costs?days=${days}&limit=250`);
      const json = await res.json();
      if (!res.ok && res.status !== 503) throw new Error(json.error || 'Failed to load costs');
      setData(json);
      setError(json.error && res.status === 503 ? json.error : '');
    } catch (err) {
      setError(err.message || 'Failed to load cost data');
      onShowToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [days, onShowToast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const summary = data?.summary;
  const logs = data?.logs || [];
  const active = data?.active || { locks: [], batches: [] };
  const today = useMemo(() => {
    const key = new Date().toISOString().slice(0, 10);
    return summary?.byDay?.find((d) => d.day === key) || { usd: 0, zar: 0, count: 0 };
  }, [summary]);

  const saveOperator = () => {
    const next = setImageGenOperator(operator);
    setOperator(next);
    onShowToast?.(`Your label is now "${next}" — shown when you run Apollo batches`, 'success');
  };

  return (
    <div className="adm-panel cost-tracking-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={20} style={{ color: '#8B1A1A' }} /> Cost Tracking
          </h2>
          <p className="adm-section-note">
            OpenRouter / Gemini image generation costs — shared across all admin users via site storage. SKU locks prevent two people overwriting the same preview slot.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="adm-field-input adm-field-input--sm">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" className="adm-btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
      </div>

      <div className="cost-operator-bar">
        <Users size={15} />
        <label>
          Your name in logs
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="e.g. Daniel, Sales desk 1"
            className="adm-field-input"
          />
        </label>
        <button type="button" className="adm-btn-dark adm-btn--sm" onClick={saveOperator}>Save</button>
      </div>

      {error && (
        <div className="cost-tracking-warn">{error}</div>
      )}

      {(active.batches?.length > 0 || active.locks?.length > 0) && (
        <section className="cost-active-section">
          <h3><Zap size={16} /> Active now</h3>
          {active.batches?.map((b) => (
            <div key={b.id} className="cost-active-card">
              <strong>{b.operator || 'Unknown'}</strong>
              <span>{b.style || 'Image batch'} · {b.done}/{b.total} done{b.failed ? ` · ${b.failed} failed` : ''}</span>
              <span className="adm-muted">Started {formatWhen(b.created_at)}</span>
            </div>
          ))}
          {active.locks?.length > 0 && (
            <p className="adm-muted cost-active-locks">
              {active.locks.length} SKU slot{active.locks.length === 1 ? '' : 's'} locked — other users must wait or pick different products.
            </p>
          )}
        </section>
      )}

      <div className="cost-stat-grid">
        <article className="cost-stat-card">
          <span>Today</span>
          <strong>{formatZar(today.zar)}</strong>
          <small>{today.count} call{today.count === 1 ? '' : 's'} · {formatUsd(today.usd)}</small>
        </article>
        <article className="cost-stat-card">
          <span>{days}-day total</span>
          <strong>{formatZar(summary?.totals?.zar)}</strong>
          <small>{summary?.totals?.count || 0} calls · {formatUsd(summary?.totals?.usd)}</small>
        </article>
        <article className="cost-stat-card">
          <span>Errors</span>
          <strong>{summary?.totals?.errors || 0}</strong>
          <small>Failed API calls in period</small>
        </article>
        <article className="cost-stat-card">
          <span>Operators</span>
          <strong>{summary?.byOperator?.length || 0}</strong>
          <small>Distinct admin labels</small>
        </article>
      </div>

      {summary?.byOperator?.length > 0 && (
        <section className="cost-breakdown">
          <h3>By operator</h3>
          <div className="cost-breakdown-table-wrap">
            <table className="adm-table cost-table">
              <thead>
                <tr><th>Operator</th><th>Calls</th><th>USD</th><th>ZAR</th></tr>
              </thead>
              <tbody>
                {summary.byOperator.map((row) => (
                  <tr key={row.operator}>
                    <td>{row.operator}</td>
                    <td>{row.count}</td>
                    <td>{formatUsd(row.usd)}</td>
                    <td>{formatZar(row.zar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="cost-log-section">
        <h3>Recent API calls</h3>
        {loading && !logs.length ? (
          <div className="adm-loading-inline"><Loader2 size={16} className="spin" /> Loading…</div>
        ) : logs.length === 0 ? (
          <p className="adm-muted">No image gen costs logged yet — run Apollo <code>/image</code> or upload with AI analysis.</p>
        ) : (
          <div className="cost-breakdown-table-wrap">
            <table className="adm-table cost-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Operator</th>
                  <th>SKU</th>
                  <th>Op</th>
                  <th>Model</th>
                  <th>USD</th>
                  <th>ZAR</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className={row.status === 'error' ? 'cost-row--error' : ''}>
                    <td>{formatWhen(row.created_at)}</td>
                    <td>{row.operator || '—'}</td>
                    <td>{row.sku ? `${row.sku}${row.slot ? ` · s${row.slot}` : ''}` : '—'}</td>
                    <td>{row.operation || '—'}</td>
                    <td className="cost-model-cell">{row.model || '—'}</td>
                    <td>{formatUsd(row.cost_usd)}</td>
                    <td>{formatZar(row.cost_zar)}</td>
                    <td>{row.status === 'error' ? row.error || 'error' : 'ok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
