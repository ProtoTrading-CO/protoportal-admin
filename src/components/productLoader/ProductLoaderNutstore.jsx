import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ChevronRight,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { readApiJson } from '../../lib/apiError.js';

function displayTitle(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

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

function categoryLabelsFromIds(tree, categoryId, sub1Id) {
  const catNode = findNode(tree, categoryId);
  const sub1Node = findNode(tree, sub1Id);
  return {
    category: catNode?.label || '',
    subcategoryOne: sub1Node?.label || catNode?.label || '',
  };
}

const GROUP_LABELS = {
  ready: 'Ready',
  needs_review: 'Needs Review',
  not_found: 'Not Found',
};

function NutstoreThumb({ path, className = 'pl-nutstore-thumb' }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let revoked = '';
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/nutstore-thumbnail?path=${encodeURIComponent(path)}`);
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        if (!cancelled) setSrc(revoked);
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [path]);

  if (!src) return <span className="pl-nutstore-thumb pl-nutstore-thumb--loading" />;
  return <img src={src} alt="" className={className} />;
}

export default function ProductLoaderNutstore({
  taxonomyTree,
  batchDefaultCategoryId,
  setBatchDefaultCategoryId,
  batchDefaultSub1Id,
  setBatchDefaultSub1Id,
  batchOverwrite,
  setBatchOverwrite,
  onShowToast,
  onPublished,
}) {
  const [status, setStatus] = useState({ loading: true, ok: false, error: '' });
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [items, setItems] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processAction, setProcessAction] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const batchSub1Options = batchDefaultCategoryId ? childrenOf(taxonomyTree, batchDefaultCategoryId) : [];

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs = [{ label: 'Root', path: '/' }];
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [currentPath]);

  const grouped = useMemo(() => ({
    ready: items.filter((i) => i.group === 'ready'),
    needs_review: items.filter((i) => i.group === 'needs_review'),
    not_found: items.filter((i) => i.group === 'not_found'),
  }), [items]);

  const selectedPaths = useMemo(() => [...selected], [selected]);

  const loadStatus = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/nutstore-browse?action=status');
      const json = await readApiJson(res, { fallback: 'Nutstore status failed' });
      setStatus({ loading: false, ok: Boolean(json.ok), error: json.error || '' });
      if (json.rootPath) setCurrentPath(json.rootPath);
    } catch (err) {
      setStatus({ loading: false, ok: false, error: err.message || 'Nutstore unavailable' });
    }
  }, []);

  const loadDirectory = useCallback(async (path, q = '') => {
    setBrowseLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ path });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/nutstore-browse?${params}`);
      const json = await readApiJson(res, { fallback: 'Browse failed' });
      setEntries(json.entries || []);
      setCurrentPath(json.path || path);
    } catch (err) {
      setError(err.message || 'Failed to load folder');
      setEntries([]);
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (status.ok) void loadDirectory(currentPath, search);
  }, [status.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (path) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllImagesInView = () => {
    const imagePaths = entries.filter((e) => e.type === 'file' && e.isImage).map((e) => e.path);
    setSelected(new Set(imagePaths));
  };

  const selectEntireFolder = async () => {
    setBrowseLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/nutstore-browse?path=${encodeURIComponent(currentPath)}&recursive=1`);
      const json = await readApiJson(res, { fallback: 'Recursive list failed' });
      const paths = (json.entries || []).map((e) => e.path);
      setSelected(new Set(paths));
      onShowToast?.(`Selected ${paths.length} image(s) in folder tree`, 'success');
    } catch (err) {
      setError(err.message || 'Failed to select folder');
    } finally {
      setBrowseLoading(false);
    }
  };

  const lookupSelected = async () => {
    if (!selectedPaths.length) {
      setError('Select one or more images first.');
      return;
    }
    setScanning(true);
    setError('');
    setItems([]);
    try {
      const res = await fetch('/api/nutstore-batch-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: selectedPaths }),
      });
      const json = await readApiJson(res, { fallback: 'Lookup failed' });
      setItems(json.items || []);
      const ready = (json.items || []).filter((i) => i.group === 'ready').length;
      onShowToast?.(`Looked up ${json.items?.length || 0} — ${ready} ready`, 'success');
    } catch (err) {
      setError(err.message || 'Lookup failed');
    } finally {
      setScanning(false);
    }
  };

  const buildProcessItems = (targetItems) => {
    const labels = categoryLabelsFromIds(taxonomyTree, batchDefaultCategoryId, batchDefaultSub1Id);
    return targetItems
      .filter((i) => i.code && (i.group === 'ready' || i.group === 'needs_review'))
      .map((item) => ({
        path: item.path,
        filename: item.filename,
        code: item.code,
        title: item.title || item.sqlRow?.title || item.code,
        price: item.price ?? item.sqlRow?.price ?? 0,
        description: item.websiteRow?.original_description || item.sqlRow?.title || item.title || '',
        category: item.websiteRow?.category || labels.category,
        subcategoryOne: item.websiteRow?.subcategory_one || labels.subcategoryOne,
        subcategoryTwo: item.websiteRow?.subcategory_two || null,
        sqlRow: item.sqlRow,
        websiteRow: item.websiteRow,
        warnings: item.warnings,
        overwriteImage: batchOverwrite,
      }));
  };

  const runProcess = async (action, targetItems) => {
    const payload = buildProcessItems(targetItems);
    if (!payload.length) {
      setError('No matched products to process.');
      return;
    }
    const needsCategory = payload.some((i) => !i.category);
    if (needsCategory) {
      setError('Pick a default category for products not already on the website.');
      return;
    }

    setProcessing(true);
    setProcessAction(action);
    setError('');
    setProgress({ done: 0, total: payload.length });

    const BATCH = 5;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < payload.length; i += BATCH) {
      const chunk = payload.slice(i, i + BATCH);
      setProgress({ done: i, total: payload.length });
      try {
        const res = await fetch('/api/nutstore-process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, items: chunk, overwriteImage: batchOverwrite }),
        });
        const json = await readApiJson(res, { fallback: `${action} failed` });
        succeeded += json.succeeded || 0;
        failed += json.failed || 0;
        if (json.results) {
          setItems((prev) => prev.map((row) => {
            const hit = json.results.find((r) => r.sku === row.code);
            if (!hit) return row;
            return { ...row, processStatus: hit.ok ? action : 'error', processError: hit.error || '' };
          }));
        }
      } catch (err) {
        failed += chunk.length;
        setError(err.message || `${action} batch failed`);
      }
    }

    setProgress({ done: payload.length, total: payload.length });
    setProcessing(false);
    setProcessAction('');
    const label = action === 'publish' ? 'Published' : 'Archived';
    onShowToast?.(`${label} ${succeeded}${failed ? `, ${failed} failed` : ''}`, failed ? 'warning' : 'success');
    if (action === 'publish' && succeeded === 1 && payload[0]) {
      onPublished?.({ sku: payload[0].code, action: 'create' });
    }
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
                <th>Code</th>
                <th>Description</th>
                <th>Price</th>
                <th>SOH</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path}>
                  <td>
                    <NutstoreThumb path={row.path} className="pl-folder-thumb" />
                  </td>
                  <td><strong>{row.code || '—'}</strong></td>
                  <td>{displayTitle(row.title, row.sqlRow?.title) || '—'}</td>
                  <td>{row.price != null ? `R ${Number(row.price).toFixed(2)}` : '—'}</td>
                  <td>{row.stockOnHand ?? row.sqlRow?.available ?? '—'}</td>
                  <td className={row.processStatus === 'error' ? 'pl-error' : ''}>
                    {row.websiteStatus || row.group}
                    {row.processError ? ` — ${row.processError}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  if (status.loading) {
    return (
      <div className="pl-section">
        <p className="adm-muted"><Loader2 size={14} className="spin" /> Connecting to Nutstore…</p>
      </div>
    );
  }

  if (!status.ok) {
    return (
      <div className="pl-section">
        <p className="pl-error">{status.error || 'Nutstore is not configured or unreachable.'}</p>
        <button type="button" className="adm-btn-ghost" onClick={() => void loadStatus()}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const processable = [...grouped.ready, ...grouped.needs_review];
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="pl-section pl-nutstore">
      <p className="pl-section-note">
        Browse your Nutstore folders. Each image filename is the product code (one image per item).
        Look up Positill for price and description, then publish live or send to the archive queue.
      </p>

      <div className="pl-nutstore-toolbar">
        <div className="pl-nutstore-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Filter current folder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void loadDirectory(currentPath, search); }}
          />
          <button type="button" className="adm-btn-ghost" onClick={() => void loadDirectory(currentPath, search)}>
            Search
          </button>
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => void loadDirectory(currentPath)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <nav className="pl-nutstore-crumbs" aria-label="Folder path">
        {breadcrumbs.map((crumb, idx) => (
          <span key={crumb.path} className="pl-nutstore-crumb">
            {idx > 0 && <ChevronRight size={12} />}
            <button type="button" onClick={() => { setSelected(new Set()); void loadDirectory(crumb.path); }}>
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="pl-nutstore-actions">
        <button type="button" className="adm-btn-ghost" disabled={browseLoading} onClick={() => void selectEntireFolder()}>
          <FolderOpen size={14} /> Select entire folder (recursive)
        </button>
        <button type="button" className="adm-btn-ghost" disabled={!entries.some((e) => e.isImage)} onClick={selectAllImagesInView}>
          Select images in view ({entries.filter((e) => e.isImage).length})
        </button>
        <span className="adm-muted">{selected.size} selected</span>
      </div>

      <div className="pl-nutstore-browser">
        {browseLoading ? (
          <p className="adm-muted"><Loader2 size={14} className="spin" /> Loading…</p>
        ) : (
          <ul className="pl-nutstore-list">
            {entries.map((entry) => (
              <li key={entry.path} className={`pl-nutstore-row pl-nutstore-row--${entry.type}`}>
                {entry.type === 'dir' ? (
                  <button
                    type="button"
                    className="pl-nutstore-dir"
                    onClick={() => { setSelected(new Set()); void loadDirectory(entry.path); }}
                  >
                    <Folder size={16} />
                    <span>{entry.name}</span>
                  </button>
                ) : entry.isImage ? (
                  <label className="pl-nutstore-file">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.path)}
                      onChange={() => toggleSelect(entry.path)}
                    />
                    <NutstoreThumb path={entry.path} />
                    <span className="pl-nutstore-name">{entry.name}</span>
                  </label>
                ) : (
                  <span className="pl-nutstore-skip">
                    <ImageIcon size={14} /> {entry.name}
                  </span>
                )}
              </li>
            ))}
            {!entries.length && <li className="adm-muted">This folder is empty.</li>}
          </ul>
        )}
      </div>

      {error && <p className="pl-error">{error}</p>}

      <div className="pl-action-row" style={{ marginTop: 12 }}>
        <button type="button" className="adm-btn-red" disabled={scanning || !selected.size} onClick={() => void lookupSelected()}>
          {scanning ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
          Look up selected ({selected.size})
        </button>
      </div>

      {items.length > 0 && (
        <>
          <div className="pl-summary-dashboard">
            <div><strong>{items.length}</strong><span>Selected</span></div>
            <div><strong>{grouped.ready.length}</strong><span>Ready</span></div>
            <div><strong>{grouped.needs_review.length}</strong><span>Needs Review</span></div>
            <div><strong>{grouped.not_found.length}</strong><span>Not Found</span></div>
          </div>

          {processing && (
            <div className="pl-progress">
              <div className="pl-progress-bar" style={{ width: `${pct}%` }} />
              <span>{processAction}… {progress.done}/{progress.total}</span>
            </div>
          )}

          {renderGroup('ready')}
          {renderGroup('needs_review')}
          {renderGroup('not_found')}

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
              Replace image if slot already filled
            </label>
          </div>

          <div className="pl-action-row">
            <button
              type="button"
              className="adm-btn-red"
              disabled={processing || !processable.length}
              onClick={() => void runProcess('publish', processable)}
            >
              {processing && processAction === 'publish' ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              Publish to website ({processable.length})
            </button>
            <button
              type="button"
              className="adm-btn-ghost"
              disabled={processing || !processable.length}
              onClick={() => void runProcess('archive', processable)}
            >
              {processing && processAction === 'archive' ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
              Send to archive ({processable.length})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
