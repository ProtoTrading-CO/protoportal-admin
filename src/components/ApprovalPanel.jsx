import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle, Loader2, Trash2, X } from 'lucide-react';

function ImageStrip({ urls, label }) {
  return (
    <div className="approval-img-strip">
      <span className="approval-img-strip-label">{label}</span>
      <div className="approval-img-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="approval-img-slot">
            {urls[i] ? <img src={urls[i]} alt="" /> : <span className="approval-img-empty">—</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ApprovalPanel({ onShowToast, onRefreshStats }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/list-approval-staging');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.items || []);
      setSelected(new Set());
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (sku) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const applyLive = async (skus) => {
    const list = [...skus];
    if (!list.length) return;
    setBusy(true);
    const errors = [];
    let ok = 0;
    for (const sku of list) {
      try {
        const res = await fetch('/api/apply-dormant-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Go live failed');
        ok += 1;
      } catch (err) {
        errors.push(`${sku}: ${err.message}`);
      }
    }
    await load();
    onRefreshStats?.();
    if (errors.length) {
      onShowToast?.(`Set live: ${ok} ok, ${errors.length} failed — ${errors.slice(0, 2).join('; ')}`, ok ? 'success' : 'error');
    } else {
      onShowToast?.(`${ok} product${ok === 1 ? '' : 's'} set live`, 'success');
    }
    setBusy(false);
  };

  const discard = async (sku) => {
    if (!window.confirm(`Discard staged preview for ${sku}? Live images unchanged.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stock-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteStagedPreview', sku }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Discard failed');
      await load();
      onShowToast?.('Preview discarded', 'success');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedList = items.filter((i) => selected.has(i.sku));

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title"><CheckCircle size={18} /> Approval</h2>
          <p className="adm-section-note">Review Apollo image-gen previews for live products. Set live applies staged images (price + SOH required for new SKUs only).</p>
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => void load()} disabled={loading || busy}>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="adm-loading-inline"><Loader2 size={18} className="spin" /> Loading…</div>
      )}

      {!loading && !items.length && (
        <p className="adm-muted" style={{ padding: '24px 0' }}>No staged previews waiting. Run image gen in Apollo (<code>/image</code>) and choose Send to Approval.</p>
      )}

      {selected.size > 0 && (
        <div className="adm-bulk-bar">
          <span>{selected.size} selected</span>
          <button type="button" className="adm-btn-red adm-btn--sm" disabled={busy} onClick={() => void applyLive(selectedList.map((i) => i.sku))}>
            Set live
          </button>
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="approval-grid">
        {items.map((item) => (
          <article key={item.sku} className={`approval-card${selected.has(item.sku) ? ' approval-card--selected' : ''}`}>
            <label className="approval-card-head">
              <input type="checkbox" checked={selected.has(item.sku)} onChange={() => toggle(item.sku)} />
              <div>
                <strong>{item.title}</strong>
                <span className="adm-muted">{item.sku}</span>
              </div>
              {item.stockReady ? (
                <span className="approval-badge approval-badge--ok"><Check size={12} /> Ready</span>
              ) : (
                <span className="approval-badge approval-badge--warn" title={item.stockError}>Stock</span>
              )}
            </label>
            {item.subcategories?.length > 0 && (
              <p className="approval-breadcrumb">{item.subcategories.join(' › ')}</p>
            )}
            <ImageStrip urls={item.liveImages} label="Live" />
            <ImageStrip urls={item.stagedImages} label="Staged" />
            <div className="approval-card-actions">
              <button type="button" className="adm-btn-red adm-btn--sm" disabled={busy} onClick={() => void applyLive([item.sku])}>
                Set live
              </button>
              <button type="button" className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger" disabled={busy} onClick={() => void discard(item.sku)}>
                <Trash2 size={13} /> Discard
              </button>
            </div>
            {!item.stockReady && item.stockError && (
              <p className="approval-stock-warn">{item.stockError}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
