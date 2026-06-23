import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle, ChevronLeft, ChevronRight, ImageOff, Loader2, Trash2, X, ZoomIn } from 'lucide-react';
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
    const url = item.stagedImages?.[i] || item.stagedImageFallbacks?.[i];
    if (url) {
      list.push({ url, label: `Staged · Image ${i + 1}`, type: 'staged', slot: i + 1 });
    }
  });
  return list;
}

function galleryIndexForSlot(item, type, slot) {
  const gallery = buildGallery(item);
  return gallery.findIndex((g) => g.type === type && g.slot === slot);
}

function ApprovalImage({ url, fallbackUrl, alt = '' }) {
  const candidates = useRef([url, fallbackUrl].filter(Boolean));
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    candidates.current = [url, fallbackUrl].filter(Boolean);
    setIdx(0);
  }, [url, fallbackUrl]);

  const src = candidates.current[idx];
  if (!src) {
    return <span className="approval-img-empty"><ImageOff size={16} /></span>;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (idx < candidates.current.length - 1) setIdx((i) => i + 1);
      }}
    />
  );
}

function ImageStrip({ urls, fallbacks = [], label, type, item, onOpenLightbox }) {
  return (
    <div className="approval-img-strip">
      <span className="approval-img-strip-label">{label}</span>
      <div className="approval-img-row">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={`approval-img-slot${(urls[i] || fallbacks[i]) ? ' approval-img-slot--clickable' : ''}`}
            disabled={!urls[i] && !fallbacks[i]}
            onClick={() => {
              const idx = galleryIndexForSlot(item, type, i + 1);
              if (idx >= 0) onOpenLightbox(item, idx);
            }}
            aria-label={urls[i] ? `View ${label} image ${i + 1}` : `Empty ${label} slot ${i + 1}`}
          >
            {urls[i] || fallbacks[i] ? (
              <>
                <ApprovalImage url={urls[i]} fallbackUrl={fallbacks[i]} alt={`${label} ${i + 1}`} />
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

function SetLiveNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const { type, applied, errorDetails } = notice;
  return (
    <div className={`approval-setlive-notice approval-setlive-notice--${type}`} role="status">
      <div className="approval-setlive-notice-icon">
        {type === 'success' ? <CheckCircle size={17} /> : <AlertCircle size={17} />}
      </div>
      <div className="approval-setlive-notice-body">
        {type === 'success' && (
          <strong>{applied} image{applied === 1 ? '' : 's'} set live — visible on trade site within ~90 seconds</strong>
        )}
        {type === 'warning' && applied > 0 && (
          <strong>{applied} image{applied === 1 ? '' : 's'} set live — {errorDetails.length} issue{errorDetails.length === 1 ? '' : 's'} below</strong>
        )}
        {type === 'warning' && applied === 0 && (
          <strong>Already up to date — no new images were applied</strong>
        )}
        {type === 'error' && (
          <strong>Set live failed — no images were updated</strong>
        )}
        {errorDetails.length > 0 && (
          <ul className="approval-setlive-errors">
            {errorDetails.map((d) => <li key={d}>{d}</li>)}
          </ul>
        )}
      </div>
      <button type="button" className="adm-icon-btn" onClick={onDismiss} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

const POLL_INTERVAL = 12_000;

function itemsSignature(list) {
  return (list || []).map((item) => [
    item.sku,
    item.updatedAt,
    ...(item.liveImages || []),
    ...(item.stagedImages || []),
    item.stockReady,
  ].join('|')).join(';;');
}

export default function ApprovalPanel({ onShowToast, onRefreshStats, embedded = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [busySkus, setBusySkus] = useState(new Set());
  const [lightbox, setLightbox] = useState(null);
  const [imageBatch, setImageBatch] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [setLiveNotice, setSetLiveNotice] = useState(null);
  const busyRef = useRef(false);
  const itemsSigRef = useRef('');

  const load = useCallback(async ({ silent = false } = {}) => {
    const showBlockingLoader = !silent && itemsSigRef.current === '';
    if (showBlockingLoader) setLoading(true);
    try {
      const res = await fetch('/api/list-approval-staging', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      const next = json.items || [];
      const sig = itemsSignature(next);
      if (sig !== itemsSigRef.current) {
        itemsSigRef.current = sig;
        setItems(next);
        setLastUpdated(Date.now());
      }
      if (!silent) setSelected(new Set());
    } catch (err) {
      if (!silent) onShowToast?.(err.message, 'error');
    } finally {
      if (showBlockingLoader) setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => { void load(); }, [load]);

  // Auto-poll when tab visible — multi-user staging updates
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      void load({ silent: true });
    };
    const id = setInterval(tick, POLL_INTERVAL);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    const onRefresh = () => { void load({ silent: true }); };
    window.addEventListener('proto-approval-refresh', onRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('proto-approval-refresh', onRefresh);
    };
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
    setBusySkus(new Set(list));
    setSetLiveNotice(null);
    const errors = [];
    const errorDetails = [];
    const succeeded = new Set();
    let ok = 0;
    let applied = 0;
    const results = await Promise.allSettled(list.map((sku) => applyDormantLive(sku)));
    results.forEach((r, i) => {
      const sku = list[i];
      if (r.status === 'fulfilled') {
        ok += 1;
        succeeded.add(sku);
        if (r.value.mode === 'image_applied') applied += 1;
        else if (r.value.mode === 'already_live') {
          errorDetails.push(`${sku}: already up to date (no new images)`);
        }
      } else {
        errors.push(sku);
        errorDetails.push(`${sku}: ${r.reason?.message}`);
      }
    });
    if (succeeded.size) {
      setItems((prev) => prev.filter((item) => !succeeded.has(item.sku)));
      setSelected((prev) => {
        const next = new Set(prev);
        succeeded.forEach((sku) => next.delete(sku));
        return next;
      });
    }
    await load({ silent: true });
    onRefreshStats?.();

    if (errors.length === list.length) {
      // All failed
      setSetLiveNotice({ type: 'error', ok, applied, errors, errorDetails });
      onShowToast?.(`Set live failed — ${errors.length} error${errors.length === 1 ? '' : 's'}`, 'error');
    } else if (errors.length > 0) {
      // Partial failure
      setSetLiveNotice({ type: 'warning', ok, applied, errors, errorDetails });
      onShowToast?.(`Set live: ${applied} image${applied === 1 ? '' : 's'} applied, ${errors.length} failed`, 'warning');
    } else if (applied === 0) {
      // All succeeded but no images actually changed (already_live)
      setSetLiveNotice({ type: 'warning', ok, applied: 0, errors: [], errorDetails });
      onShowToast?.('Already up to date — no new images were applied', 'warning');
    } else {
      // Full success
      setSetLiveNotice({ type: 'success', ok, applied, errors: [], errorDetails: [] });
      onShowToast?.(`${applied} image${applied === 1 ? '' : 's'} set live — visible on trade site within ~90 seconds`, 'success');
    }
    setBusy(false);
    setBusySkus(new Set());
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
      await load({ silent: true });
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
              {lastUpdated ? (
                <span className="approval-last-updated" aria-live="off">
                  {' '}· Updated {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              ) : null}
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
            {lastUpdated ? (
              <span className="approval-last-updated" aria-live="off">
                {' '}· {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            ) : null}
          </p>
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => void load()} disabled={loading || busy}>
            Refresh now
          </button>
        </div>
      )}

      <div className="approval-notices-stack">
        <ImageBatchNotice
          batch={imageBatch}
          onDismiss={() => dismissImageBatch()}
          onRefresh={() => { void load(); onRefreshStats?.(); }}
        />
        <SetLiveNotice notice={setLiveNotice} onDismiss={() => setSetLiveNotice(null)} />
      </div>

      {loading && !items.length && (
        <div className="adm-loading-inline"><Loader2 size={18} className="spin" /> Loading…</div>
      )}

      {!loading && !items.length && (
        <p className="adm-muted approval-empty">No staged previews waiting. Run image gen in Apollo (<code>/image</code>) and choose Send to Approval.</p>
      )}

      <div className={`approval-bulk-bar-slot${selected.size > 0 ? ' approval-bulk-bar-slot--visible' : ''}`}>
        {selected.size > 0 && (
          <div className="adm-bulk-bar">
            <span>{selected.size} selected</span>
            <button type="button" className="adm-btn-red adm-btn--sm" disabled={busy} onClick={() => void applyLive(selectedList.map((i) => i.sku))}>
              {busy ? <><Loader2 size={13} className="spin" /> Setting live…</> : `Set ${selected.size} live`}
            </button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>

      {items.length > 0 && (
      <div className={`approval-grid${loading ? ' approval-grid--refreshing' : ''}`}>
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
              {(item.stagedBy || item.expiresAt) && (
                <p className="approval-staging-meta adm-muted">
                  {item.stagedBy ? `Staged by ${item.stagedBy}` : null}
                  {item.stagedBy && item.expiresAt ? ' · ' : null}
                  {item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : null}
                </p>
              )}
              <ImageStrip urls={item.liveImages} fallbacks={[]} label="Live" type="live" item={item} onOpenLightbox={openLightbox} />
              <ImageStrip urls={item.stagedImages} fallbacks={item.stagedImageFallbacks || []} label="Staged" type="staged" item={item} onOpenLightbox={openLightbox} />
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
                  {busySkus.has(item.sku) ? <><Loader2 size={13} className="spin" /> Setting live…</> : 'Set live'}
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
      )}

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
