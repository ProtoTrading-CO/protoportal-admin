import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle,
  Grip,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import CategorySidebar from './CategorySidebar';
import ReorderGrid from './ReorderGrid';
import NewItemsPanel from './NewItemsPanel';
import { useCatalogQuery, buildCatalogParams, CATALOG_STATUSES } from '../hooks/useCatalog';
import { useCatalogMutations } from '../hooks/useCatalogMutations';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';

const STATUS_META = {
  live: { label: 'Live', icon: PackagePlus },
  archived: { label: 'Archived', icon: Archive },
  'new-items': { label: 'New Items', icon: Sparkles },
  approval: { label: 'Approval', icon: CheckCircle },
  recycle: { label: 'Recycle Bin', icon: Trash2 },
};

const ROW_COLUMNS = {
  live: '32px 72px 2fr 140px 120px',
  archived: '32px 72px 2fr 140px 120px',
  approval: '32px 72px 2fr 120px',
  recycle: '32px 72px 2fr 120px',
  'new-items': '32px 72px 2fr 120px',
};

const STOCK_STATUSES = new Set(['live', 'archived']);

function formatStockUnits(qty, keepLive = false) {
  if (keepLive && (qty === null || qty === undefined || qty <= 0)) return 'Available';
  if (qty === null || qty === undefined) return '—';
  return `${qty} units`;
}

function CatalogSkeleton() {
  return (
    <div className="pm-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="pm-skeleton-row" />
      ))}
    </div>
  );
}

function Pager({ page, total, pageSize, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="adm-pager">
      <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
      <span>{page} / {pages} · {total} items</span>
      <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  );
}

function scrollProductListToTop(anchor) {
  requestAnimationFrame(() => {
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

export default function ProductManagerEngine({
  taxonomyTree = [],
  onShowToast,
  onRefreshStats,
  onEditProduct,
  initialStatus = 'live',
}) {
  const [status, setStatus] = useState(initialStatus);
  const [reorderMode, setReorderMode] = useState(false);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryPath, setCategoryPath] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [reorderProducts, setReorderProducts] = useState([]);
  const [sortOrderMeta, setSortOrderMeta] = useState({ updatedAt: null });
  const listTopRef = useRef(null);

  const mutations = useCatalogMutations();
  const showStockColumn = STOCK_STATUSES.has(status);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [status, debouncedSearch, categoryPath.join('/')]);

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    scrollProductListToTop(listTopRef.current);
  }, []);

  const catalogParams = useMemo(() => buildCatalogParams({
    status,
    page,
    pageSize: reorderMode && status === 'live' ? 500 : pageSize,
    search: debouncedSearch,
    categoryPath,
  }), [status, page, pageSize, debouncedSearch, categoryPath, reorderMode]);

  const { data, isLoading, isFetching, isPlaceholderData } = useCatalogQuery(catalogParams);
  const rows = data?.rows || [];
  const total = data?.total || 0;
  const tree = taxonomyTree.length ? taxonomyTree : (data?.tree || []);

  useEffect(() => {
    scrollProductListToTop(listTopRef.current);
  }, [status, debouncedSearch, categoryPath.join('/')]);

  useEffect(() => {
    if (reorderMode && status === 'live' && rows.length) {
      setReorderProducts(rows);
    }
  }, [reorderMode, status, rows]);

  const categoryKey = categoryPath.length ? categoryPath.join('/') : '__all__';

  const loadSortOrder = useCallback(async () => {
    if (!categoryKey || categoryKey === '__all__') return;
    try {
      const res = await fetch(`/api/category-sort-order?categoryKey=${encodeURIComponent(categoryKey)}`);
      const json = await res.json();
      if (!res.ok) return;
      setSortOrderMeta({ updatedAt: json.updatedAt });
      if (json.skuOrder?.length && reorderProducts.length) {
        const orderMap = new Map(json.skuOrder.map((id, i) => [id, i]));
        setReorderProducts((prev) => [...prev].sort((a, b) => (orderMap.get(a.id) ?? 999999) - (orderMap.get(b.id) ?? 999999)));
      }
    } catch { /* ignore */ }
  }, [categoryKey, reorderProducts.length]);

  useEffect(() => {
    if (reorderMode) void loadSortOrder();
  }, [reorderMode, categoryKey]);

  const persistOrder = async (next) => {
    const skuOrder = next.map((p) => p.id);
    try {
      const res = await fetch('/api/category-sort-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryKey,
          skuOrder,
          expectedUpdatedAt: sortOrderMeta.updatedAt,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        onShowToast?.(json.error || 'Reorder conflict — reload', 'error');
        void loadSortOrder();
        return;
      }
      if (!res.ok) throw new Error(json.error);
      setSortOrderMeta({ updatedAt: json.updatedAt });
    } catch (err) {
      onShowToast?.(err.message, 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action) => {
    const skus = [...selected];
    if (!skus.length) return;
    const errors = [];
    for (const sku of skus) {
      try {
        await action.mutateAsync(sku);
      } catch (err) {
        errors.push(`${sku}: ${err.message}`);
      }
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    onRefreshStats?.();
    if (errors.length) {
      onShowToast?.(`${skus.length - errors.length} ok, ${errors.length} failed`, 'warning');
    } else {
      onShowToast?.(`${skus.length} updated`, 'success');
    }
  };

  const showSkeleton = isLoading && !isPlaceholderData && !data;

  return (
    <div className="adm-panel adm-panel-with-sidebar pm-engine">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Product Manager</h2>
          <p className="adm-section-note">In-stock products are live on the site. Filter by status or use reorder mode for sort order.</p>
        </div>
        <div className="pm-engine-head-actions">
          {isFetching && !isLoading && <Loader2 size={16} className="spin" aria-label="Refreshing" />}
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['catalog'] })}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="adm-customer-tabs pm-status-tabs">
        {CATALOG_STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <button
              key={s}
              type="button"
              className={`adm-tab${status === s ? ' adm-tab--active' : ''}`}
              onClick={() => { setStatus(s); setReorderMode(false); }}
            >
              <Icon size={14} /> {meta.label}
            </button>
          );
        })}
        {status === 'live' && (
          <button
            type="button"
            className={`adm-tab pm-reorder-tab${reorderMode ? ' adm-tab--active' : ''}`}
            onClick={() => setReorderMode((v) => !v)}
          >
            <Grip size={14} /> Reorder mode
          </button>
        )}
      </div>

      {status === 'new-items' ? (
        <div className="adm-panel-main pm-panel-body">
          <NewItemsPanel
          dormantRows={rows}
          dormantSearch={searchInput}
          onDormantSearchChange={setSearchInput}
          dormantSelected={selected}
          onDormantSelectedChange={setSelected}
          saving={mutations.setLive.isPending}
          onGoLive={(sku) => mutations.setLive.mutateAsync(sku).then(() => onRefreshStats?.())}
          onGoLiveSelected={() => runBulk(mutations.setLive)}
          onRemoveProduct={(sku) => mutations.permanentDelete.mutateAsync(sku)}
          onLoadDormant={() => queryClient.invalidateQueries({ queryKey: ['catalog'] })}
          onShowToast={onShowToast}
          taxonomyTree={tree}
          />
        </div>
      ) : (
        <div className="adm-panel-split">
          <CategorySidebar
            tree={tree}
            selectedPath={categoryPath}
            onSelectPath={setCategoryPath}
          />
          <div className="adm-panel-main">
            <div className="adm-toolbar pm-toolbar">
              <label className="adm-search">
                <Search size={15} />
                <input
                  type="search"
                  className="adm-search-input"
                  placeholder="Search SKU, barcode, title…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </label>
              {selected.size > 0 && (
                <div className="pm-bulk-bar">
                  <span>{selected.size} selected</span>
                  {status === 'live' && (
                    <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => runBulk(mutations.archive)}>Archive</button>
                  )}
                  {status === 'archived' && (
                    <>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => runBulk(mutations.unarchive)}>Restore</button>
                      <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => runBulk(mutations.softDelete)}>To recycle</button>
                    </>
                  )}
                  {status === 'approval' && (
                    <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => runBulk(mutations.setLive)}>Set live</button>
                  )}
                  {status === 'recycle' && (
                    <>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => runBulk(mutations.restoreRecycle)}>Restore</button>
                      <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => runBulk(mutations.permanentDelete)}>Delete forever</button>
                    </>
                  )}
                </div>
              )}
            </div>

            {showSkeleton ? <CatalogSkeleton /> : reorderMode && status === 'live' ? (
              <ReorderGrid
                products={reorderProducts}
                onProductsChange={setReorderProducts}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                mainCategoryId={categoryPath[0] || tree[0]?.id}
                selectedPath={categoryPath}
                taxonomyTree={tree}
                loading={isLoading}
                dragDisabled={!!debouncedSearch}
                onEditProduct={onEditProduct}
                onPersistOrder={(next) => void persistOrder(next)}
              />
            ) : (
              <>
                <div ref={listTopRef} className="pm-list-anchor" aria-hidden="true" />
                <div className="adm-list pm-list">
                  <div
                    className="adm-list-head pm-list-head"
                    style={{ gridTemplateColumns: ROW_COLUMNS[status] || ROW_COLUMNS.live }}
                  >
                    <span />
                    <span />
                    <span>Product</span>
                    {showStockColumn && <span>Stock</span>}
                    <span>Actions</span>
                  </div>
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className={`adm-list-row${selected.has(item.id) ? ' adm-list-row--selected' : ''}`}
                      style={{ gridTemplateColumns: ROW_COLUMNS[status] || ROW_COLUMNS.live }}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                          aria-label={`Select ${item.sku}`}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {item.image ? (
                          <img src={item.image} alt="" className="adm-product-thumb" />
                        ) : (
                          <div className="adm-product-thumb adm-product-thumb--placeholder">IMG</div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {item.title || item.name || item.sku}
                          {!item.image && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>
                          )}
                        </div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>
                          <span title="Barcode">BC: {item.barcode || item.code || '—'}</span>
                          {item.sku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {item.sku}</span>}
                          {item.price > 0 && (
                            <span title="Price excl. VAT" style={{ marginLeft: 8, fontWeight: 700, color: '#374151' }}>
                              R{Number(item.price).toFixed(2)}
                            </span>
                          )}
                        </div>
                        {item.categoryLabel && (
                          <div className="adm-muted" style={{ fontSize: 11 }}>{item.categoryLabel}</div>
                        )}
                        {status === 'approval' && item.stockError && (
                          <span className="adm-list-warn" style={{ fontSize: 11 }}>{item.stockError}</span>
                        )}
                      </div>
                      {showStockColumn && (
                        <div>
                          <span style={{
                            fontWeight: status === 'archived' ? 900 : 700,
                            fontSize: status === 'archived' ? 15 : undefined,
                            color: !item.keepLiveWhenOos && item.stockQty < 0
                              ? '#b91c1c'
                              : (status === 'archived' ? '#8B1A1A' : undefined),
                          }}
                          >
                            {formatStockUnits(item.stockQty, item.keepLiveWhenOos)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {status === 'live' && (
                          <>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => onEditProduct?.(item)}>Edit</button>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.archive.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Archive</button>
                          </>
                        )}
                        {status === 'archived' && (
                          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.unarchive.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Restore</button>
                        )}
                        {status === 'approval' && (
                          <>
                            <button
                              type="button"
                              className="adm-btn-red adm-btn--sm"
                              disabled={item.stockReady === false}
                              onClick={() => mutations.setLive.mutate(item.sku, {
                                onSuccess: () => onRefreshStats?.(),
                                onError: (err) => onShowToast?.(err.message, 'error'),
                              })}
                            >
                              Set live
                            </button>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.discardPreview.mutate(item.sku)}>Discard</button>
                          </>
                        )}
                        {status === 'recycle' && (
                          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.restoreRecycle.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>
                            <ArchiveRestore size={14} /> Restore
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!rows.length && !isLoading && (
                    <p className="adm-empty">No products in this view.</p>
                  )}
                </div>
                <Pager page={page} total={total} pageSize={pageSize} onPageChange={handlePageChange} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
