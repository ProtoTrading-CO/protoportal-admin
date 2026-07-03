import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Loader2, Users, Zap } from 'lucide-react';
import { getImageGenOperator, setImageGenOperator } from '../lib/imageGenSession';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';

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

function budgetBarClass(level) {
  if (level === 'exceeded') return 'cost-budget-bar__fill--exceeded';
  if (level === 'warning') return 'cost-budget-bar__fill--warning';
  return '';
}

function BudgetMeter({ label, period }) {
  if (!period?.limitUsd) return null;
  const pct = Math.min(100, period.pct ?? 0);
  return (
    <article className={`cost-budget-meter cost-budget-meter--${period.level}`}>
      <div className="cost-budget-meter-head">
        <strong>{label}</strong>
        <span>{formatUsd(period.spentUsd)} / {formatUsd(period.limitUsd)} ({pct}%)</span>
      </div>
      <div className="cost-budget-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`cost-budget-bar__fill ${budgetBarClass(period.level)}`} style={{ width: `${pct}%` }} />
      </div>
    </article>
  );
}

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 80);
    throw new Error(
      res.ok
        ? 'Invalid response from cost tracking API'
        : `Server error (${res.status})${snippet ? `: ${snippet}` : ''}`,
    );
  }
}

export default function CostTrackingPanel({ onShowToast }) {
  const [operator, setOperator] = useState(() => getImageGenOperator());
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [budgetForm, setBudgetForm] = useState({
    dailyUsd: '50',
    monthlyUsd: '200',
    alertEmail: 'danieljoffeinfo@gmail.com',
    blockAtLimit: true,
    alertsEnabled: true,
  });

  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/image-gen-costs?days=${days}&limit=250`);
      const json = await parseJsonResponse(res);
      if (loadSeqRef.current !== seq) return;
      if (!res.ok && res.status !== 503) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load costs');
      }
      setData(json);
      setError(typeof json.error === 'string' && res.status === 503 ? json.error : '');
      const cfg = json.budget?.config;
      if (cfg) {
        setBudgetForm({
          dailyUsd: String(cfg.dailyUsd ?? 50),
          monthlyUsd: String(cfg.monthlyUsd ?? 200),
          alertEmail: cfg.alertEmail || 'danieljoffeinfo@gmail.com',
          blockAtLimit: cfg.blockAtLimit !== false,
          alertsEnabled: cfg.alertsEnabled !== false,
        });
      }
    } catch (err) {
      if (loadSeqRef.current !== seq) return;
      const message = err?.message || 'Failed to load cost data';
      setError(message);
      onShowToast?.(message, 'error');
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  }, [days, onShowToast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onRefresh = (event) => {
      if (event.detail === 'cost-tracking') void load();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  const summary = data?.summary;
  const logs = data?.logs || [];
  const budget = data?.budget;
  const active = data?.active || { locks: [], batches: [] };
  // Only batches that are genuinely still running: items left to process AND
  // started recently. Completed, fully-failed and stale batches drop off.
  const liveBatches = (active.batches || []).filter((b) => {
    const done = Number(b?.done || 0);
    const total = Number(b?.total || 0);
    const failed = Number(b?.failed || 0);
    const pending = total > 0 && done + failed < total;
    const fresh = Date.now() - new Date(b?.created_at || 0).getTime() < 20 * 60 * 1000;
    return pending && fresh;
  });
  const today = useMemo(() => {
    const key = new Date().toISOString().slice(0, 10);
    return summary?.byDay?.find((d) => d.day === key) || { usd: 0, zar: 0, count: 0 };
  }, [summary]);

  const saveOperator = () => {
    const next = setImageGenOperator(operator);
    setOperator(next);
    onShowToast?.(`Your label is now "${next}" — shown when you run Apollo batches`, 'success');
  };

  const saveBudget = async () => {
    setSavingBudget(true);
    try {
      const res = await fetch('/api/image-gen-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveBudget',
          dailyUsd: Number(budgetForm.dailyUsd),
          monthlyUsd: Number(budgetForm.monthlyUsd),
          alertEmail: budgetForm.alertEmail.trim(),
          blockAtLimit: budgetForm.blockAtLimit,
          alertsEnabled: budgetForm.alertsEnabled,
        }),
      });
      const json = await parseJsonResponse(res);
      if (!res.ok) throw new Error(json.error || 'Failed to save budget');
      setData((prev) => (prev ? { ...prev, budget: json.budget } : prev));
      onShowToast?.('Budget limits saved', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Failed to save budget', 'error');
    } finally {
      setSavingBudget(false);
    }
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
          {loading && <Loader2 size={14} className="spin" aria-label="Refreshing" />}
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

      {budget && (
        <section className={`cost-budget-section cost-budget-section--${budget.level}`}>
          <h3>Budget limits</h3>
          {budget.blocked && (
            <p className="cost-budget-blocked" role="alert">
              <strong>Image generation blocked</strong> — daily or monthly limit reached. Raise limits below or wait for the period to reset.
            </p>
          )}
          {!budget.blocked && budget.level === 'warning' && (
            <p className="cost-budget-warn" role="alert">
              Approaching budget limit ({budget.warnPct}%+) — alerts go to <code>{budget.alertEmail}</code>.
            </p>
          )}
          <div className="cost-budget-meters">
            <BudgetMeter label="Today (UTC)" period={budget.daily} />
            <BudgetMeter label="This month (UTC)" period={budget.monthly} />
          </div>
          <div className="cost-budget-settings">
            <label>
              Daily limit (USD)
              <input
                type="number"
                min="1"
                step="1"
                className="adm-field-input"
                value={budgetForm.dailyUsd}
                onChange={(e) => setBudgetForm((f) => ({ ...f, dailyUsd: e.target.value }))}
              />
            </label>
            <label>
              Monthly limit (USD)
              <input
                type="number"
                min="1"
                step="5"
                className="adm-field-input"
                value={budgetForm.monthlyUsd}
                onChange={(e) => setBudgetForm((f) => ({ ...f, monthlyUsd: e.target.value }))}
              />
            </label>
            <label>
              Alert email
              <input
                type="email"
                className="adm-field-input"
                value={budgetForm.alertEmail}
                onChange={(e) => setBudgetForm((f) => ({ ...f, alertEmail: e.target.value }))}
              />
            </label>
            <label className="cost-budget-check">
              <input
                type="checkbox"
                checked={budgetForm.alertsEnabled}
                onChange={(e) => setBudgetForm((f) => ({ ...f, alertsEnabled: e.target.checked }))}
              />
              Email at {budget.warnPct}% and 100%
            </label>
            <label className="cost-budget-check">
              <input
                type="checkbox"
                checked={budgetForm.blockAtLimit}
                onChange={(e) => setBudgetForm((f) => ({ ...f, blockAtLimit: e.target.checked }))}
              />
              Block new image gen at 100%
            </label>
            <button type="button" className="adm-btn-dark adm-btn--sm" onClick={() => void saveBudget()} disabled={savingBudget}>
              {savingBudget ? <Loader2 size={14} className="spin" /> : null}
              Save limits
            </button>
          </div>
        </section>
      )}

      {(liveBatches.length > 0 || active.locks?.length > 0) && (
        <section className="cost-active-section">
          <h3><Zap size={16} /> Active now</h3>
          {liveBatches.map((b) => (
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

      {summary?.byCostSource?.length > 0 && (
        <section className="cost-breakdown">
          <h3>By cost source</h3>
          <div className="cost-breakdown-table-wrap">
            <table className="adm-table cost-table">
              <thead>
                <tr><th>Source</th><th>Calls</th><th>USD</th><th>ZAR</th></tr>
              </thead>
              <tbody>
                {summary.byCostSource.map((row) => (
                  <tr key={row.costSource}>
                    <td>{row.costSource === 'openrouter' ? 'OpenRouter actual' : 'Estimated'}</td>
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

      {summary?.byOperation?.length > 0 && (
        <section className="cost-breakdown">
          <h3>By operation</h3>
          <div className="cost-breakdown-table-wrap">
            <table className="adm-table cost-table">
              <thead>
                <tr><th>Operation</th><th>Calls</th><th>USD</th><th>ZAR</th></tr>
              </thead>
              <tbody>
                {summary.byOperation.map((row) => (
                  <tr key={row.operation}>
                    <td>{row.operation}</td>
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
                  <th>Source</th>
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
                    <td>{row.cost_source === 'openrouter' ? 'API' : 'Est.'}</td>
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
