import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Image, Loader2, Search, X } from 'lucide-react';
import CategorySidebar from './CategorySidebar';
import { fetchAdminProductsPage } from '../lib/products';
import {
  formatFolderPrice,
  formatFolderStock,
  revokeFolderPreviewUrls,
  scanFolderFilenames,
} from '../lib/apolloFolderUpload';

export default function ApolloProductPicker({
  taxonomyTree = [],
  selectedIds,
  onSelectedIdsChange,
  folderItems = [],
  onFolderItemsChange,
  onShowToast,
}) {
  const [categoryPath, setCategoryPath] = useState([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState(folderItems.length ? 'folder' : 'catalogue');
  const [folderScanning, setFolderScanning] = useState(false);
  const [folderError, setFolderError] = useState('');
  const folderRef = useRef(null);
  const pageSize = 80;

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (folderItems.length) setViewMode('folder');
  }, [folderItems.length]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminProductsPage({
        page,
        pageSize,
        searchQuery: searchDebounced,
        categoryPathFilter: categoryPath,
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchDebounced, categoryPath]);

  useEffect(() => { if (viewMode === 'catalogue') void load(); }, [load, viewMode]);
  useEffect(() => { setPage(1); }, [categoryPath, searchDebounced]);

  const toggle = (id) => {
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInView = () => {
    const ids = viewMode === 'folder'
      ? folderSelectable.map((p) => p.sku).filter(Boolean)
      : rows.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleFolderSelect = async (fileList) => {
    setFolderScanning(true);
    setFolderError('');
    try {
      revokeFolderPreviewUrls(folderItems);
      const items = await scanFolderFilenames(fileList);
      const matched = items.filter((i) => i.isLive).length;
      const unmatched = items.length - matched;
      onFolderItemsChange?.(items);
      setViewMode('folder');
      onSelectedIdsChange(new Set());
      onShowToast?.(
        `Matched ${matched} live product${matched === 1 ? '' : 's'}${unmatched ? ` · ${unmatched} skipped (not live)` : ''}`,
        matched ? 'success' : 'warning',
      );
    } catch (err) {
      setFolderError(err.message || 'Folder scan failed');
    } finally {
      setFolderScanning(false);
    }
  };

  const clearFolder = () => {
    revokeFolderPreviewUrls(folderItems);
    onFolderItemsChange?.([]);
    setViewMode('catalogue');
    setFolderError('');
    onSelectedIdsChange(new Set());
  };

  const folderSelectable = folderItems.filter((i) => i.canSelect && i.sku);
  const folderUnmatched = folderItems.filter((i) => !i.canSelect);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="apollo-picker">
      <div className="apollo-picker-folder-bar">
        <input
          ref={folderRef}
          type="file"
          accept="image/*"
          multiple
          webkitdirectory=""
          directory=""
          hidden
          onChange={(e) => {
            void handleFolderSelect(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="adm-btn-ghost adm-btn--sm"
          disabled={folderScanning}
          onClick={() => !folderScanning && folderRef.current?.click()}
        >
          {folderScanning ? <Loader2 size={14} className="spin" /> : <FolderOpen size={14} />}
          {folderScanning ? 'Scanning folder…' : 'Upload folder'}
        </button>
        {folderItems.length > 0 && (
          <>
            <button
              type="button"
              className={`adm-btn-ghost adm-btn--sm${viewMode === 'folder' ? ' apollo-picker-mode--on' : ''}`}
              onClick={() => setViewMode('folder')}
            >
              Folder matches ({folderSelectable.length})
            </button>
            <button
              type="button"
              className={`adm-btn-ghost adm-btn--sm${viewMode === 'catalogue' ? ' apollo-picker-mode--on' : ''}`}
              onClick={() => setViewMode('catalogue')}
            >
              Browse catalogue
            </button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={clearFolder} title="Clear folder upload">
              <X size={14} /> Clear folder
            </button>
          </>
        )}
        <span className="adm-muted apollo-picker-folder-hint">
          Name files with product codes — e.g. <code>ME039-2.jpg</code> or <code>8626100145-1.jpg</code>
        </span>
      </div>

      {folderError && <p className="apollo-picker-folder-error">{folderError}</p>}

      {viewMode === 'folder' ? (
        <div className="apollo-picker-main">
          <div className="apollo-picker-toolbar">
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={selectAllInView}>
              {folderSelectable.length > 0 && folderSelectable.every((p) => selectedIds.has(p.sku))
                ? 'Deselect all'
                : `Select all matched (${folderSelectable.length})`}
            </button>
            <span className="adm-muted">{selectedIds.size} selected · {folderSelectable.length} live matches</span>
          </div>

          {folderSelectable.length > 0 ? (
            <div className="apollo-picker-grid apollo-picker-grid--folder">
              {folderSelectable.map((item) => (
                <label
                  key={item.filename}
                  className={`apollo-picker-card apollo-picker-card--folder${selectedIds.has(item.sku) ? ' apollo-picker-card--on' : ''}`}
                >
                  <input type="checkbox" checked={selectedIds.has(item.sku)} onChange={() => toggle(item.sku)} />
                  <div className="apollo-picker-folder-preview">
                    {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Image size={24} color="#cbd5e1" />}
                  </div>
                  <div className="apollo-picker-meta">
                    <strong title={item.title}>{item.title}</strong>
                    <span className="apollo-picker-sku">{item.sku}</span>
                    <span className="apollo-picker-folder-stats">
                      {formatFolderPrice(item.price)} · SOH {formatFolderStock(item)}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="adm-muted">No live catalogue matches in this folder.</p>
          )}

          {folderUnmatched.length > 0 && (
            <details className="apollo-picker-unmatched">
              <summary>{folderUnmatched.length} file{folderUnmatched.length === 1 ? '' : 's'} not matched to live products</summary>
              <ul>
                {folderUnmatched.map((item) => (
                  <li key={item.filename}>
                    <span>{item.filename}</span>
                    <span>{item.code || 'invalid name'}</span>
                    <span>{item.warnings?.includes('not_in_catalog') ? 'Not in catalogue' : 'Not live on site'}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div className="apollo-picker-layout">
          <CategorySidebar
            tree={taxonomyTree}
            selectedPath={categoryPath}
            onSelectPath={setCategoryPath}
          />
          <div className="apollo-picker-main">
            <div className="apollo-picker-toolbar">
              <label className="adm-search apollo-picker-search">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search SKU, barcode, name…"
                  className="adm-search-input"
                />
              </label>
              <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={selectAllInView}>
                {rows.length > 0 && rows.every((p) => selectedIds.has(p.id)) ? 'Deselect view' : `Select all in view (${rows.length})`}
              </button>
              <span className="adm-muted">{selectedIds.size} selected · {total} products</span>
            </div>

            {loading ? (
              <div className="adm-loading-inline"><Loader2 size={18} className="spin" /> Loading products…</div>
            ) : (
              <div className="apollo-picker-grid">
                {rows.map((p) => (
                  <label key={p.id} className={`apollo-picker-card${selectedIds.has(p.id) ? ' apollo-picker-card--on' : ''}`}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} />
                    <div className="apollo-picker-thumbs">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="apollo-picker-thumb">
                          {p.images?.[i] ? <img src={p.images[i]} alt="" /> : <Image size={12} color="#cbd5e1" />}
                        </div>
                      ))}
                    </div>
                    <div className="apollo-picker-meta">
                      <strong>{p.name}</strong>
                      <span>{p.sku || p.id}</span>
                    </div>
                  </label>
                ))}
                {!rows.length && <p className="adm-muted">No products in this category.</p>}
              </div>
            )}

            {totalPages > 1 && (
              <div className="apollo-picker-pager">
                <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span className="adm-muted">Page {page} / {totalPages}</span>
                <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
