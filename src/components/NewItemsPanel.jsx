import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Image,
  ImagePlus,
  Loader2,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import ImageGenPanel from './ImageGenPanel';
import { runDormantImageBatch } from '../lib/dormantImageQueue';

function stripExt(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}

/** Match SKU.ext, SKU-1.ext, SKU-2.ext, SKU-3.ext (hyphen before slot number). */
export function parseSkuFromFilename(filename) {
  const base = stripExt(filename);
  const m = base.match(/^(.+)-([1-3])$/);
  if (m) return { sku: m[1], slot: Number(m[2]) + 1 };
  return { sku: base, slot: 1 };
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NewItemsPanel({
  dormantRows,
  dormantSearch,
  onDormantSearchChange,
  dormantSelected,
  onDormantSelectedChange,
  uploadQueue,
  onUploadQueueChange,
  reprocessBusy,
  onReprocessBusyChange,
  imageGenStyle,
  onImageGenStyleChange,
  imageGenPrompt,
  onImageGenPromptChange,
  costLog,
  onCostLogChange,
  saving,
  onGoLive,
  onGoLiveSelected,
  onRemoveProduct,
  onLoadDormant,
  onShowToast,
  singleImageRef,
  folderImageRef,
  excelInputRef,
  imageFolderRef,
  onLegacyUpload,
  reprocessAbortRef,
}) {
  const [stockStatus, setStockStatus] = useState({});
  const [importBusy, setImportBusy] = useState(false);
  const [imagePrompts, setImagePrompts] = useState({});
  const [genBusy, setGenBusy] = useState(false);
  const localAbortRef = useRef(null);

  useEffect(() => {
    const skus = dormantRows.map((p) => p.id || p.code);
    if (!skus.length) { setStockStatus({}); return; }
    let cancelled = false;
    fetch('/api/enrich-dormant-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const map = {};
        for (const item of json.items || []) map[item.sku] = item;
        setStockStatus(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dormantRows]);

  const handleExcelImport = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const res = await fetch('/api/import-new-items-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(json.error || 'Import failed');
      await onLoadDormant();
      const ok = json.imported || 0;
      const fail = json.failed?.length || 0;
      onShowToast(`Imported ${ok} row${ok === 1 ? '' : 's'}${fail ? `, ${fail} failed` : ''}`, fail && !ok ? 'error' : 'success');
      if (json.failed?.length) {
        console.warn('Import failures:', json.failed);
      }
    } catch (err) {
      onShowToast(err.message || 'Excel import failed', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImageFolder = async (files) => {
    if (!files?.length) return;
    onReprocessBusyChange(true);
    const grouped = new Map();
    for (const file of files) {
      const { sku, slot } = parseSkuFromFilename(file.name);
      if (!sku) continue;
      if (!grouped.has(sku)) grouped.set(sku, {});
      grouped.get(sku)[slot] = file;
    }

    try {
      for (const [sku, slots] of grouped) {
        const images = {};
        for (const [slot, file] of Object.entries(slots)) {
          const base64 = await fileToBase64(file);
          const res = await fetch('/api/upload-new-product-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || 'image/jpeg',
              base64,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `Upload failed for ${file.name}`);
          images[slot] = json.url;
        }
        const patchRes = await fetch('/api/patch-dormant-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, images }),
        });
        const patchJson = await patchRes.json();
        if (!patchRes.ok) throw new Error(patchJson.error || `Patch failed for ${sku}`);
      }
      await onLoadDormant();
      onShowToast(`Matched images for ${grouped.size} SKU${grouped.size === 1 ? '' : 's'}`);
    } catch (err) {
      onShowToast(err.message || 'Image folder upload failed', 'error');
    } finally {
      onReprocessBusyChange(false);
    }
  };

  const runImageGen = async (targets, { promptOverride, slots } = {}) => {
    if (!targets.length) return;
    const ac = new AbortController();
    localAbortRef.current = ac;
    if (reprocessAbortRef) reprocessAbortRef.current = ac;
    setGenBusy(true);
    onReprocessBusyChange(true);

    const queueItems = [];
    for (const t of targets) {
      const useSlots = slots || [1, 2, 3, 4].filter((s) => {
        if (s === 1) return t.image || t.images?.[0];
        return t.images?.[s - 1] || t[`image${s}`];
      });
      const slotList = useSlots.length ? useSlots : [1];
      for (const slot of slotList) {
        queueItems.push({
          sku: t.id || t.code,
          name: t.name,
          slot,
          thumbUrl: t.images?.[slot - 1] || t.image,
          status: 'pending',
          message: 'Queued…',
        });
      }
    }
    onUploadQueueChange([...queueItems, ...uploadQueue.filter((q) => q.status === 'done' || q.status === 'error')]);

    try {
      await runDormantImageBatch(targets.map((t) => ({
        sku: t.id || t.code,
        title: t.name,
        slots: slots || undefined,
      })), {
        prompt: promptOverride ?? imageGenPrompt,
        imageStyle: imageGenStyle,
        signal: ac.signal,
        onItemUpdate: (index, patch) => {
          onUploadQueueChange((prev) => {
            const next = prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
            if (patch.status === 'done') {
              const doneItem = next[index];
              const rest = next.filter((_, idx) => idx !== index);
              return [doneItem, ...rest];
            }
            return next;
          });
          if (patch.status === 'done') void onLoadDormant();
        },
      });
      await onLoadDormant();
      onShowToast('Image generation complete');
    } catch (err) {
      if (!ac.signal.aborted) onShowToast(err.message || 'Generation failed', 'error');
    } finally {
      setGenBusy(false);
      onReprocessBusyChange(false);
      localAbortRef.current = null;
      if (reprocessAbortRef) reprocessAbortRef.current = null;
    }
  };

  const selectedProducts = dormantRows.filter((p) => dormantSelected.has(p.id));

  return (
    <div className="adm-panel new-items-panel">
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) void handleExcelImport(e.target.files[0]); e.target.value = ''; }} />
      <input ref={imageFolderRef} type="file" accept="image/*" multiple webkitdirectory="" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) void handleImageFolder(e.target.files); e.target.value = ''; }} />
      {singleImageRef && folderImageRef && (
        <>
          <input ref={singleImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length && onLegacyUpload) void onLegacyUpload(e.target.files); e.target.value = ''; }} />
          <input ref={folderImageRef} type="file" accept="image/*" multiple webkitdirectory="" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length && onLegacyUpload) void onLegacyUpload(e.target.files); e.target.value = ''; }} />
        </>
      )}

      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} style={{ color: '#8B1A1A' }} /> New Items
          </h2>
          <p className="adm-section-note">
            Stage A: Excel product list. Stage B: image folder (<code>SKU.jpg</code>, <code>SKU-1.jpg</code> … <code>SKU-3.jpg</code>).
            Review, generate images, then Set Live when price + SOH exist in stock.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => excelInputRef?.current?.click()} className="adm-btn-red" disabled={importBusy}>
            {importBusy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Import Excel
          </button>
          <button type="button" onClick={() => imageFolderRef?.current?.click()} className="adm-btn-ghost" disabled={reprocessBusy}>
            <ImagePlus size={14} /> Upload image folder
          </button>
          {dormantSelected.size > 0 && (
            <>
              <span className="adm-pill">{dormantSelected.size} selected</span>
              <button type="button" onClick={() => void onGoLiveSelected()} className="adm-btn-dark" disabled={saving === 'bulk-live'}>
                <Zap size={14} /> {saving === 'bulk-live' ? 'Going live…' : 'Set Live'}
              </button>
              <button type="button" onClick={() => void runImageGen(selectedProducts)} className="adm-btn-ghost" disabled={genBusy}>
                <Sparkles size={14} /> Generate images
              </button>
              <button type="button" onClick={() => onDormantSelectedChange(new Set())} className="adm-btn-ghost">Clear</button>
            </>
          )}
        </div>
      </div>

      <ImageGenPanel
        style={imageGenStyle}
        onStyleChange={onImageGenStyleChange}
        prompt={imageGenPrompt}
        onPromptChange={onImageGenPromptChange}
      />

      {uploadQueue.length > 0 && (
        <div className="new-items-feed">
          <div className="new-items-feed-head">
            <span>{reprocessBusy || genBusy ? 'Processing…' : 'Complete'} · {uploadQueue.filter((q) => q.status === 'done').length}/{uploadQueue.length}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(reprocessBusy || genBusy) && (
                <button type="button" className="reprocess-live-feed-stop" onClick={() => localAbortRef.current?.abort()}>
                  <Square size={12} fill="currentColor" /> Stop
                </button>
              )}
              {!reprocessBusy && !genBusy && (
                <button type="button" className="adm-icon-btn" onClick={() => onUploadQueueChange([])}><X size={13} /></button>
              )}
            </div>
          </div>
          <div className="new-items-feed-list">
            {[...uploadQueue].map((item, i) => (
              <div key={`${item.sku}-${item.slot || 0}-${i}`} className={`new-items-feed-row new-items-feed-row--${item.status}`}>
                <div className="new-items-feed-thumb">
                  {item.previewUrl || item.thumbUrl ? <img src={item.previewUrl || item.thumbUrl} alt="" /> : <Image size={14} color="#cbd5e1" />}
                </div>
                <strong>{item.name || item.sku}{item.slot > 1 ? ` · img ${item.slot}` : ''}</strong>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="adm-search" style={{ marginBottom: 16, display: 'flex' }}>
        <Search size={15} />
        <input value={dormantSearch} onChange={(e) => onDormantSearchChange(e.target.value)} placeholder="Search by SKU, barcode, title, category…" className="adm-search-input" />
      </label>

      {dormantRows.length === 0 && (
        <div className="adm-empty" style={{ padding: '48px 0', textAlign: 'center' }}>
          <Sparkles size={36} style={{ color: '#d1d5db', marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No staged items. Import Excel or upload images to begin.</p>
        </div>
      )}

      <div className="new-items-grid">
        {dormantRows.map((product) => {
          const sku = product.id || product.code;
          const stock = stockStatus[sku];
          const images = product.images?.length ? product.images : [product.image].filter(Boolean);
          const promptKey = `${sku}-all`;
          return (
            <article key={sku} className={`new-items-card${dormantSelected.has(product.id) ? ' new-items-card--selected' : ''}`}>
              <div className="new-items-card-head">
                <input
                  type="checkbox"
                  checked={dormantSelected.has(product.id)}
                  onChange={() => onDormantSelectedChange((prev) => {
                    const next = new Set(prev);
                    if (next.has(product.id)) next.delete(product.id);
                    else next.add(product.id);
                    return next;
                  })}
                  style={{ accentColor: '#8B1A1A' }}
                />
                <div className="new-items-card-meta">
                  <strong>{product.name}</strong>
                  <span className="adm-muted">{sku}</span>
                  <span className="adm-muted">{product.categoryLabel || product.category || '—'}</span>
                  {product.stillLive && <span className="adm-pill adm-pill--live">Still live on site</span>}
                  {stock && (
                    <span className={`adm-pill${stock.ready ? ' adm-pill--ok' : ' adm-pill--warn'}`}>
                      {stock.ready ? `R${Number(stock.price).toFixed(2)} · SOH ${stock.soh}` : (stock.error || 'Not ready')}
                    </span>
                  )}
                </div>
                <div className="new-items-card-actions">
                  <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => void runImageGen([product])} disabled={genBusy}>
                    <Sparkles size={13} /> Gen all
                  </button>
                  <button type="button" className="adm-btn-dark adm-btn--sm" onClick={() => void onGoLive(product)} disabled={!!saving || (stock && !stock.ready && !product.stillLive)}>
                    <Zap size={13} /> {product.stillLive ? 'Apply' : 'Set Live'}
                  </button>
                  <button type="button" className="adm-icon-btn" onClick={() => void onRemoveProduct(product)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="new-items-card-images">
                {[0, 1, 2, 3].map((idx) => {
                  const url = images[idx];
                  const slot = idx + 1;
                  const slotKey = `${sku}-${slot}`;
                  return (
                    <div key={slotKey} className="new-items-image-slot">
                      <div className="new-items-image-thumb">
                        {url ? <img src={url} alt="" /> : <span className="adm-muted">Slot {slot}</span>}
                      </div>
                      <textarea
                        className="new-items-image-prompt"
                        rows={2}
                        placeholder={`Prompt for image ${slot}…`}
                        value={imagePrompts[slotKey] ?? ''}
                        onChange={(e) => setImagePrompts((p) => ({ ...p, [slotKey]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm"
                        disabled={!url || genBusy}
                        onClick={() => void runImageGen([product], { promptOverride: imagePrompts[slotKey] || imageGenPrompt, slots: [slot] })}
                      >
                        Apply
                      </button>
                    </div>
                  );
                })}
              </div>
              <textarea
                className="new-items-batch-prompt"
                rows={2}
                placeholder="Apply instruction to all 4 images of this SKU…"
                value={imagePrompts[promptKey] ?? ''}
                onChange={(e) => setImagePrompts((p) => ({ ...p, [promptKey]: e.target.value }))}
              />
              <button
                type="button"
                className="adm-btn-ghost adm-btn--sm"
                disabled={genBusy}
                onClick={() => void runImageGen([product], { promptOverride: imagePrompts[promptKey] || imageGenPrompt, slots: [1, 2, 3, 4] })}
              >
                Run prompt on all images
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
