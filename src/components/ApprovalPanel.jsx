import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle, ChevronLeft, ChevronRight, Loader2, Trash2, X, ZoomIn } from 'lucide-react';
import { dismissImageBatch, subscribeImageBatch } from '../lib/imageBatchTracker';
import { applyDormantLive } from '../lib/products';

function buildGallery(item) {
  const list = [];
  [0, 1, 2, 3].forEach((i) => {
    if (item.liveImages?.[i]) {
      list.push({ url: item.liveImages[i], label: `Live · Image ${i + 1}`, type: 'live', slot: i + 1 });
    }
  });
  [0, 1, 2, 3].forEach((i) => {
    if (item.stagedImages?.[i]) {
      list.push({ url: item.stagedImages[i], label: `Staged · Image ${i + 1}`, type: 'staged', slot: i + 1 });
    }
  });
  return list;
}

function galleryIndexForSlot(item, type, slot) {
  const gallery = buildGallery(item);
  return gallery.findIndex((g) => g.type === type && g.slot === slot);
}

function ImageStrip({ urls, label, type, item, onOpenLightbox }) {
  return (
    <div className="approval-img-strip">
      <span className="approval-img-strip-label">{label}</span>
      <div className="approval-img-row">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={`approval-img-slot${urls[i] ? ' approval-img-slot--clickable' : ''}`}
            disabled={!urls[i]}
            onClick={() => {
              const idx = galleryIndexForSlot(item, type, i + 1);
              if (idx >= 0) onOpenLightbox(item, idx);
            }}
            aria-label={urls[i] ? `View ${label} image ${i + 1}` : `Empty ${label} slot ${i + 1}`}
          >
            {urls[i] ? (
              <>
                <img src={urls[i]} alt="" />
                <span className="approval-img-zoom"><ZoomIn size={14} /></span>
              </>
            ) : (
              <span className="approval-img-empty">—</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageLightbox({ gallery, index, onClose, onChangeIndex }) {
  const current = gallery?.[index];
  const hasPrev = gallery && index > 0;
  const hasNext = gallery && index < gallery.length - 1;

  useEffect(() => {
    if (!gallery?.length) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onChangeIndex(index - 1);
      if (e.key === 'ArrowRight' && index < gallery.length - 1) onChangeIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gallery, index, onClose, onChangeIndex]);

  if (!gallery?.length || index < 0 || !current) return null;

  return (
    <div className="approval-lightbox" role="dialog" aria-modal="true" aria-label="Image preview">
      <button type="button" className="approval-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="approval-lightbox-inner">
        <header className="approval-lightbox-head">
          <div>
            <span className={`approval-lightbox-tag approval-lightbox-tag--${current.type}`}>{current.type}</span>
            <strong>{current.label}</strong>
          </div>
          <span className="approval-lightbox-counter">{index + 1} / {gallery.length}</span>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="approval-lightbox-stage">
          {hasPrev && (
            <button type="button" className="approval-lightbox-nav approval-lightbox-nav--prev" onClick={() => onChangeIndex(index - 1)} aria-label="Previous image">
              <ChevronLeft size={28} />
            </button>
          )}
          <img src={current.url} alt={current.label} className="approval-lightbox-img" />
          {hasNext && (
            <button type="button" className="approval-lightbox-nav approval-lightbox-nav--next" onClick={() => onChangeIndex(index + 1)} aria-label="Next image">
              <ChevronRight size={28} />
            </button>
          )}
        </div>
        <div className="approval-lightbox-thumbs">
          {gallery.map((g, i) => (
            <button
              key={`${g.type}-${g.slot}`}
              type="button"
              className={`approval-lightbox-thumb${i === index ? ' approval-lightbox-thumb--active' : ''}`}
              onClick={() => onChangeIndex(i)}
            >
              <img src={g.url} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImageBatchNotice({ batch, onDismiss, onRefresh }) {
  const prevStatus = useRef(null);

  useEffect(() => {
    if (prevStatus.current === 'running' && batch?.status === 'complete') {
      onRefresh?.();
    }
    prevStatus.current = batch?.status ?? null;
  }, [batch?.status, onRefresh]);

  if (!batch) return null;

  if (batch.status === 'running') {
    const processed = (batch.done || 0) + (batch.failed || 0);
    const pct = batch.total ? Math.round((processed / batch.total) * 100) : 0;
    return (
      <div className="approval-batch-notice approval-batch-notice--running" role="status">
        <Loader2 size={18} className="spin" />
        <div className="approval-batch-notice-copy">
          <strong>Generating images — we&apos;ll notify you when it&apos;s done</strong>
          <span>
            {batch.productCount} product{batch.productCount === 1 ? '' : 's'} · {processed}/{batch.total} images
            {batch.currentLabel ? ` · ${batch.currentLabel}` : ''}
          </span>
          <div className="approval-batch-notice-bar"><div style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    );
  }

  if (batch.status === 'complete') {
    return (
      <div className="approval-batch-notice approval-batch-notice--done" role="status">
        <CheckCircle size={18} />
        <div className="approval-batch-notice-copy">
          <strong>Batch complete — ready for review</strong>
          <span>{batch.done} image{batch.done === 1 ? '' : 's'} staged{batch.failed ? ` · ${batch.failed} failed` : ''}. Refresh below if previews aren&apos;t visible yet.</span>
        </div>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }

  if (batch.status === 'cancelled') {
    return (
      <div className="approval-batch-notice approval-batch-notice--cancelled" role="status">
        <span>Image batch stopped.</span>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }

  return null;
}

const POLL_INTERVAL = 12_000;

export default function ApprovalPanel({ onShowToast, onRefreshStats, embedded = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [imageBatch, setImageBatch] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const busyRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/list-approval-staging', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.items || []);
      setLastUpdated(Date.now());
      if (!silent) setSelected(new Set());
    } catch (err) {
      if (!silent) onShowToast?.(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load]);

  // Auto-poll so any user sees images staged by another user without manual refresh
  useEffect(() => {
    const id = setInterval(() => {
      if (!busyRef.current) void load({ silent: true });
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => subscribeImageBatch(setImageBatch), []);

  const toggle = (sku) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const openLightbox = (item, startIndex) => {
    const gallery = buildGallery(item);
    if (!gallery.length) return;
    const idx = Math.min(Math.max(0, startIndex), gallery.length - 1);
    setLightbox({ gallery, index: idx });
  };

  const applyLive = async (skus) => {
    const list = [...skus];
    if (!list.length) return;
    setBusy(true);
    const errors = [];
    let ok = 0;
    let applied = 0;
    for (const sku of list) {
      try {
        const result = await applyDormantLive(sku);
        ok += 1;
        if (result.mode === 'image_applied') applied += 1;
      } catch (err) {
        errors.push(`${sku}: ${err.message}`);
      }
    }
    setSelected(new Set());
    await load();
    onRefreshStats?.();
    if (errors.length) {
      onShowToast?.(
        `Set live: ${ok} ok, ${errors.length} failed${errors.length ? ` — ${errors.slice(0, 3).join('; ')}` : ''}`,
        ok ? 'warning' : 'error',
      );
    } else {
      const note = applied
        ? ' Trade site updates within ~1 minute (hard refresh if images look stale).'
        : '';
      onShowToast?.(`${ok} product${ok === 1 ? '' : 's'} set live.${note}`, 'success');
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
    <div className={embedded ? 'approval-panel-embedded' : 'adm-panel approval-panel'}>
      {!embedded && (
        <div className="adm-section-head">
          <div>
            <h2 className="adm-section-title"><CheckCircle size={18} /> Approval</h2>
            <p className="adm-section-note">
              Review staged images before publishing. Auto-refreshes every 12s — all users see changes live.
              {lastUpdated && <span className="approval-last-updated"> · Last updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
            </p>
          </div>
          <button type="button" className="adm-btn-ghost" onClick={() => void load()} disabled={loading || busy}>
            Refresh now
          </button>
        </div>
      )}

      {embedded && (
        <div className="approval-embedded-toolbar">
          <p className="adm-section-note">
            Review staged images before publishing — auto-refreshes every 12s.
            {lastUpdated && <span className="approval-last-updated"> · {new Date(lastUpdated).toLocaleTimeString()}</span>}
          </p>
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => void load()} disabled={loading || busy}>
            Refresh now
          </button>
        </div>
      )}

      <ImageBatchNotice
        batch={imageBatch}
        onDismiss={() => dismissImageBatch()}
        onRefresh={() => { void load(); onRefreshStats?.(); }}
      />

      {loading && (
        <div className="adm-loading-inline"><Loader2 size={18} className="spin" /> Loading…</div>
      )}

      {!loading && !items.length && (
        <p className="adm-muted approval-empty">No staged previews waiting. Run image gen in Apollo (<code>/image</code>) and choose Send to Approval.</p>
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
                <div className="approval-card-title">
                  <strong>{item.title}</strong>
                  <span>{item.sku}</span>
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
              <ImageStrip urls={item.liveImages} label="Live" type="live" item={item} onOpenLightbox={openLightbox} />
              <ImageStrip urls={item.stagedImages} label="Staged" type="staged" item={item} onOpenLightbox={openLightbox} />
              <button
                type="button"
                className="approval-view-all"
                onClick={() => openLightbox(item, 0)}
                disabled={!buildGallery(item).length}
              >
                <ZoomIn size={14} /> View all images
              </button>
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

      {lightbox && (
        <ImageLightbox
          gallery={lightbox.gallery}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onChangeIndex={(index) => setLightbox((prev) => (prev ? { ...prev, index } : null))}
        />
      )}
    </div>
  );
}
