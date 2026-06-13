import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Image,
  ImagePlus,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { downloadNewItemsExcelTemplate } from '../lib/newItemsExcelTemplate.js';

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
  saving,
  onGoLive,
  onGoLiveSelected,
  onRemoveProduct,
  onLoadDormant,
  onShowToast,
  onReprocessBusyChange,
  singleImageRef,
  folderImageRef,
  excelInputRef,
  imageFolderRef,
  onLegacyUpload,
  taxonomyTree = [],
}) {
  const [stockStatus, setStockStatus] = useState({});
  const [importBusy, setImportBusy] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);

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
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'products') || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        .filter((row) => {
          const sku = String(row.SKU || row.sku || '').trim();
          return sku && sku.toUpperCase() !== 'EXAMPLE-SKU';
        });
      if (!rows.length) throw new Error('No product rows found — fill in the Products sheet (remove the example row).');
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
    } catch (err) {
      onShowToast(err.message || 'Excel import failed', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const handleImageFolder = async (files) => {
    if (!files?.length) return;
    setFolderBusy(true);
    onReprocessBusyChange?.(true);
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
      setFolderBusy(false);
      onReprocessBusyChange?.(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await downloadNewItemsExcelTemplate(taxonomyTree);
      onShowToast('Template downloaded — fill the Products sheet and import when ready', 'success');
    } catch (err) {
      onShowToast(err.message || 'Could not generate template', 'error');
    } finally {
      setTemplateBusy(false);
    }
  };

  const selectedProducts = dormantRows.filter((p) => dormantSelected.has(p.id));
  const busy = importBusy || folderBusy || templateBusy;

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
            Set Live when price + SOH exist in stock. Product image generation → Apollo <code>/image</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => void handleDownloadTemplate()} className="adm-btn-ghost" disabled={busy}>
            {templateBusy ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Download template
          </button>
          <button type="button" onClick={() => excelInputRef?.current?.click()} className="adm-btn-red" disabled={busy}>
            {importBusy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Import Excel
          </button>
          <button type="button" onClick={() => imageFolderRef?.current?.click()} className="adm-btn-ghost" disabled={busy}>
            <ImagePlus size={14} /> Upload image folder
          </button>
          {dormantSelected.size > 0 && (
            <>
              <span className="adm-pill">{dormantSelected.size} selected</span>
              <button type="button" onClick={() => void onGoLiveSelected()} className="adm-btn-dark" disabled={saving === 'bulk-live'}>
                <Zap size={14} /> {saving === 'bulk-live' ? 'Going live…' : 'Set Live'}
              </button>
              <button type="button" onClick={() => onDormantSelectedChange(new Set())} className="adm-btn-ghost">Clear</button>
            </>
          )}
        </div>
      </div>

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
                  {stock && (
                    <span className={`adm-pill${stock.ready ? ' adm-pill--ok' : ' adm-pill--warn'}`}>
                      {stock.ready ? <><Check size={11} /> R{Number(stock.price).toFixed(2)} · SOH {stock.soh}</> : (stock.error || 'Not ready')}
                    </span>
                  )}
                </div>
                <div className="new-items-card-actions">
                  <button type="button" className="adm-btn-dark adm-btn--sm" onClick={() => void onGoLive(product)} disabled={!!saving || (stock && !stock.ready)}>
                    <Zap size={13} /> Set Live
                  </button>
                  <button type="button" className="adm-icon-btn" onClick={() => void onRemoveProduct(product)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="new-items-card-images new-items-card-images--view">
                {[0, 1, 2, 3].map((idx) => {
                  const url = images[idx];
                  return (
                    <div key={idx} className="new-items-image-slot">
                      <div className="new-items-image-thumb">
                        {url ? <img src={url} alt="" /> : <span className="adm-muted"><Image size={14} /> {idx + 1}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
