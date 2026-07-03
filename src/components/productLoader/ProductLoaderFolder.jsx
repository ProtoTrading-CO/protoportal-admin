import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Loader2,
  PackagePlus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { exportBatchReportCsv, isImageFile } from '../../lib/parseIntakeFilename';
import { lookupFilenames, logPublishFailure, publishLoaderImageItem } from '../../lib/productLoaderApi';
import { catalogueDisplayTitle, loaderCodeLabel } from '../../lib/productLoaderDisplay.js';
import ProductLoaderApolloSend from './ProductLoaderApolloSend';
import LoaderCodeEllipsis from './LoaderCodeEllipsis.jsx';

function findNode(tree, id) {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function childrenOf(tree, id) {
  return findNode(tree, id)?.children || [];
}

const GROUP_LABELS = {
  ready: 'Ready',
  needs_review: 'Needs Review',
  not_found: 'Not Found',
};

export default function ProductLoaderFolder({
  taxonomyTree,
  batchDefaultCategoryId,
  setBatchDefaultCategoryId,
  batchDefaultSub1Id,
  setBatchDefaultSub1Id,
  batchOverwrite,
  setBatchOverwrite,
  onShowToast,
  onSendToApollo,
}) {
  const folderRef = useRef(null);
  const [items, setItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stats, setStats] = useState({ published: 0, dormant: 0, failed: 0 });

  const batchSub1Options = batchDefaultCategoryId ? childrenOf(taxonomyTree, batchDefaultCategoryId) : [];

  const grouped = useMemo(() => ({
    ready: items.filter((i) => i.group === 'ready'),
    needs_review: items.filter((i) => i.group === 'needs_review'),
    not_found: items.filter((i) => i.group === 'not_found'),
  }), [items]);

  const summary = useMemo(() => ({
    found: items.length,
    matched: items.filter((i) => i.canPublish).length,
    ready: grouped.ready.length,
    needsReview: grouped.needs_review.length,
    notFound: grouped.not_found.length,
    published: stats.published,
    dormant: stats.dormant,
  }), [items, grouped, stats]);

  const handleFolder = async (fileList) => {
    const files = [...(fileList || [])].filter(isImageFile);
    if (!files.length) {
      setError('No image files found in that folder.');
      return;
    }
    setScanning(true);
    setError('');
    setItems([]);
    setStats({ published: 0, dormant: 0, failed: 0 });
    try {
      const merged = await lookupFilenames(files.map((f) => f.name), files);
      for (const row of merged) {
        if (row.file) row.previewUrl = URL.createObjectURL(row.file);
      }
      setItems(merged);
      onShowToast?.(`Scanned ${merged.length} images — ${summary.ready || merged.filter((i) => i.group === 'ready').length} ready`, 'success');
    } catch (err) {
      setError(err.message || 'Folder scan failed');
    } finally {
      setScanning(false);
    }
  };

  const publishItems = async (targetItems) => {
    const ready = targetItems.filter((i) => (i.group === 'ready' || i.group === 'needs_review') && i.file && i.code);
    if (!ready.length) return;
    const needsCategory = ready.some((i) => !i.websiteRow?.category);
    if (needsCategory && !batchDefaultCategoryId) {
      setError('Pick a default category for new products.');
      return;
    }

    setProcessing(true);
    setError('');
    setStartedAt(Date.now());
    setProgress({ done: 0, total: ready.length, current: '' });
    let published = 0;
    let failed = 0;

    for (let idx = 0; idx < ready.length; idx += 1) {
      const row = ready[idx];
      setProgress({ done: idx, total: ready.length, current: row.filename });
      setElapsedMs(Date.now() - (startedAt || Date.now()));
      setItems((prev) => prev.map((r) => (r.filename === row.filename ? { ...r, status: 'processing' } : r)));

      try {
        await publishLoaderImageItem(row, {
          taxonomyTree,
          findNode,
          defaultCategoryId: batchDefaultCategoryId,
          defaultSub1Id: batchDefaultSub1Id,
          overwrite: batchOverwrite,
        });
        published += 1;
        setItems((prev) => prev.map((r) => (r.filename === row.filename ? { ...r, status: 'done' } : r)));
      } catch (err) {
        failed += 1;
        await logPublishFailure({ sku: row.code, filename: row.filename, reason: err.message });
        setItems((prev) => prev.map((r) => (r.filename === row.filename ? { ...r, status: 'error', processError: err.message } : r)));
      }
    }

    setStats((s) => ({ ...s, published: s.published + published, failed: s.failed + failed }));
    setProgress({ done: ready.length, total: ready.length, current: '' });
    setElapsedMs(Date.now() - (startedAt || Date.now()));
    setProcessing(false);
    onShowToast?.(`Published ${published}${failed ? `, ${failed} failed` : ''}`, failed ? 'warning' : 'success');
  };

  const retryFailed = async () => {
    const failed = items.filter((i) => i.status === 'error');
    await publishItems(failed);
  };

  const exportReport = () => {
    const csv = exportBatchReportCsv(items, summary);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-loader-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderGroup = (key) => {
    const rows = grouped[key];
    if (!rows.length) return null;
    return (
      <section key={key} className="pl-folder-group">
        <h4>{GROUP_LABELS[key]} <span className="adm-muted">({rows.length})</span></h4>
        <div className="pl-folder-table-wrap">
          <table className="pl-folder-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>SKU</th>
                <th>Description</th>
                <th>Slot</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.filename}>
                  <td>{row.previewUrl ? <img src={row.previewUrl} alt="" className="pl-folder-thumb" /> : '—'}</td>
                  <td><LoaderCodeEllipsis value={loaderCodeLabel(row)} /></td>
                  <td>{catalogueDisplayTitle(row) || '—'}</td>
                  <td>{row.imageSlot}</td>
                  <td className={row.status === 'error' ? 'pl-error' : ''}>{row.status || row.group}{row.processError ? ` — ${row.processError}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="pl-section">
      <p className="pl-section-note">
        Choose a folder of supplier images. Each filename is parsed as a product code and looked up automatically.
      </p>

      <div className="pl-dropzone" role="button" tabIndex={0} onClick={() => !scanning && !processing && folderRef.current?.click()}>
        <input ref={folderRef} type="file" accept="image/*" multiple webkitdirectory="" directory="" hidden onChange={(e) => { void handleFolder(e.target.files); e.target.value = ''; }} />
        {scanning ? <span><Loader2 size={16} className="spin" /> Scanning folder…</span> : <span><FolderOpen size={16} /> Choose image folder</span>}
      </div>

      {error && <p className="pl-error">{error}</p>}

      {items.length > 0 && (
        <>
          <div className="pl-summary-dashboard">
            <div><strong>{summary.found}</strong><span>Images Found</span></div>
            <div><strong>{summary.matched}</strong><span>Matched</span></div>
            <div><strong>{summary.published}</strong><span>Published</span></div>
            <div><strong>{summary.dormant}</strong><span>Dormant</span></div>
            <div><strong>{summary.needsReview}</strong><span>Needs Review</span></div>
            <div><strong>{summary.notFound}</strong><span>Not Found</span></div>
            <div><strong>{elapsedMs ? `${(elapsedMs / 1000).toFixed(1)}s` : '—'}</strong><span>Elapsed</span></div>
          </div>

          {processing && (
            <div className="pl-progress">
              <div className="pl-progress-bar" style={{ width: `${pct}%` }} />
              <span>Processing {progress.done + 1}/{progress.total}{progress.current ? ` — ${progress.current}` : ''}</span>
            </div>
          )}

          {renderGroup('ready')}
          {renderGroup('needs_review')}
          {renderGroup('not_found')}

          <ProductLoaderApolloSend items={items} onSendToApollo={onSendToApollo} onShowToast={onShowToast} />

          <div className="pl-inline-fields">
            <label>
              Default category (new products)
              <select className="adm-select adm-select--enhanced" value={batchDefaultCategoryId} onChange={(e) => { setBatchDefaultCategoryId(e.target.value); setBatchDefaultSub1Id(''); }}>
                <option value="">— Select if needed —</option>
                {taxonomyTree.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
            </label>
            {batchSub1Options.length > 0 && (
              <label>
                Default subcategory
                <select className="adm-select adm-select--enhanced" value={batchDefaultSub1Id} onChange={(e) => setBatchDefaultSub1Id(e.target.value)}>
                  <option value="">— Optional —</option>
                  {batchSub1Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>
              </label>
            )}
            <label className="pl-check">
              <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} />
              Replace images if slot already filled
            </label>
          </div>

          <div className="pl-action-row">
            <button type="button" className="adm-btn-red" disabled={processing || scanning || !grouped.ready.length} onClick={() => void publishItems(grouped.ready)}>
              {processing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              Publish All Ready ({grouped.ready.length})
            </button>
            <button type="button" className="adm-btn-ghost" disabled={processing || !items.some((i) => i.status === 'error')} onClick={() => void retryFailed()}>
              <RefreshCw size={14} /> Retry Failed
            </button>
            <button type="button" className="adm-btn-ghost" onClick={exportReport}>
              <Download size={14} /> Export Report
            </button>
          </div>
        </>
      )}
    </div>
  );
}
