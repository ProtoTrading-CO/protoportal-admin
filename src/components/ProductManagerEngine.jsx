import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  FileSpreadsheet,
  FolderPlus,
  FolderTree,
  Grip,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import CategorySidebar, { resolvePathLabels } from './CategorySidebar';
import ReorderGrid from './ReorderGrid';
import ApprovalPanel from './ApprovalPanel';
import BulkProductEditModal from './BulkProductEditModal';
import BulkMoveModal from './BulkMoveModal';
import { useCatalogQuery, buildCatalogParams, fetchAllCatalogRows, CATALOG_STATUSES } from '../hooks/useCatalog';
import { useCatalogMutations } from '../hooks/useCatalogMutations';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { getActiveImageBatch, subscribeImageBatch } from '../lib/imageBatchTracker';
import { sortOrderCategoryKey, lookupSortOrder, applySkuOrder, sortOrderLookupKeys } from '../lib/taxonomy';
import { persistSortOrder, fetchSortOrderStore, sortMetaForPath, formatSortSavedAt, fetchSortMetaForCategory } from '../lib/sortOrderStore';
import { exportProductsCatalogXlsx, exportAllProductsCatalogXlsx, exportSelectedProductsXlsx } from '../lib/exportLiveProducts';
import { bulkMoveProducts, invalidateAdminCache, updateProduct } from '../lib/products';
import { formatWebsitePrice } from '../lib/pricing';
import { childrenOfTree, fetchCategoryProductCounts, subcategoryOptionsFromTree } from '../lib/taxonomyAdmin';

const ONLY_IN_STOCK_KEY = 'pm_only_in_stock';

function readOnlyInStockPref() {
  try {
    return sessionStorage.getItem(ONLY_IN_STOCK_KEY) === '1';
  } catch {
    return false;
  }
}

const STATUS_META = {
  live: { label: 'Live', icon: PackagePlus },
  archived: { label: 'Archived', icon: Archive },
  approval: { label: 'Approval', icon: CheckCircle },
  recycle: { label: 'Recycle Bin', icon: Trash2 },
};

const ROW_COLUMNS = {
  live: '32px 96px 2fr 140px 140px',
  archived: '32px 96px 2fr 140px 140px',
  approval: '32px 96px 2fr 140px',
  recycle: '32px 96px 2fr 140px',
};

const STOCK_STATUSES = new Set(['live', 'archived']);

const LARGE_BULK_MOVE_THRESHOLD = 100;

function MultiCategoryBadge({ item, tree }) {
  if (!item?.isMultiCategory) return null;
  const primary = [item.categoryLabel, ...(item.subcategoryLabels || [])].filter(Boolean).join(' › ');
  const mottaroLabels = item.alternateCategoryPath?.length
    ? resolvePathLabels(tree, item.alternateCategoryPath).join(' › ')
    : 'Mottaro';
  return (
    <span
      title={`Primary: ${primary}\nAlso in: ${mottaroLabels}`}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#5b21b6',
        background: '#ede9fe',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Multi-category
    </span>
  );
}

function ProductCategoryLine({ item }) {
  if (!item.categoryLabel && !item.isMultiCategory) return null;
  const primary = [item.categoryLabel, ...(item.subcategoryLabels || [])].filter(Boolean).join(' › ');
  return (
    <div className="adm-muted" style={{ fontSize: 11 }}>
      {primary}
      {item.isMultiCategory && item.alternateCategoryPath?.length > 1 && (
        <span style={{ display: 'block', color: '#6d28d9', marginTop: 2 }}>
          + Mottaro › {item.alternateCategoryPath.slice(1).map((id) => id.replace(/^mottaro-/, '').replace(/-/g, ' ')).join(' › ')}
        </span>
      )}
    </div>
  );
}

function formatStockUnits(qty) {
  const n = qty === null || qty === undefined ? 0 : Number(qty);
  return `${Number.isFinite(n) ? n : 0} units`;
}

function NutstoreArchiveBadge({ archivedBy }) {
  if (archivedBy !== 'nutstore') return null;
  return (
    <span
      title="Archived from Nutstore Product Loader"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#5b21b6',
        background: '#ede9fe',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Nutstore
    </span>
  );
}

function NeedsSohPriceBadge({ item }) {
  const soh = item.stockOnHand ?? item.stockQty ?? 0;
  if (soh !== 0 || (item.price ?? 0) !== 0 || item.stockLinked !== false) return null;
  return (
    <span
      title="No Positill match yet — set price and stock on hand"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#92400e',
        background: '#fef3c7',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Needs SOH/price
    </span>
  );
}

/** ERP-linked but Positill reports 0 SOH — waiting for stock, not missing data. */
function OutOfStockLinkedBadge({ item }) {
  const soh = item.stockOnHand ?? item.stockQty ?? 0;
  if (soh !== 0 || item.stockLinked !== true) return null;
  return (
    <span
      title="Linked to Positill — waiting for stock to arrive"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#475569',
        background: '#f1f5f9',
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      Out of stock
    </span>
  );
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

function PmMobileProductCard({
  item,
  index,
  status,
  selected,
  showStockColumn,
  onCheckboxClick,
  onRowShiftClick,
  onEditProduct,
  onMakeLive,
  mutations,
  onRefreshStats,
  recycleSku,
  onShowToast,
  tree,
}) {
  return (
    <article
      className={`pm-mobile-card${selected.has(item.id) ? ' pm-mobile-card--selected' : ''}`}
      onClick={(e) => onRowShiftClick?.(e, item.id, item, index)}
    >
      <div className="pm-mobile-card-top">
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onClick={(e) => onCheckboxClick(e, item.id, item, index)}
          readOnly
          style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
          aria-label={`Select ${item.sku}`}
        />
        {item.image ? (
          <img src={item.image} alt="" className="adm-product-thumb pm-mobile-card-thumb" />
        ) : (
          <div className="adm-product-thumb adm-product-thumb--placeholder pm-mobile-card-thumb">IMG</div>
        )}
        <div className="pm-mobile-card-main">
          <strong>{productListTitle(item, status)}</strong>
          {!item.image && (
            <span className="pm-mobile-card-badge">No image</span>
          )}
          {item.isNew && (
            <span className="pm-mobile-card-badge" style={{ background: '#0f766e', color: '#fff' }}>New arrival</span>
          )}
          <NutstoreArchiveBadge archivedBy={item.archivedBy} />
          <NeedsSohPriceBadge item={item} />
          <OutOfStockLinkedBadge item={item} />
          <MultiCategoryBadge item={item} tree={tree} />
          <div className="adm-muted pm-mobile-card-meta">
            <span>BC: <CodeEllipsis value={item.barcode || item.code} /></span>
            {item.sku && <span>WSK: <CodeEllipsis value={item.sku} /></span>}
            {item.price > 0 && <span>R{formatWebsitePrice(item.price)}</span>}
          </div>
          {item.categoryLabel && (
            <ProductCategoryLine item={item} />
          )}
          {showStockColumn && (
            <div className="pm-mobile-card-stock">
              {formatStockUnits(item.stockQty)}
            </div>
          )}
        </div>
      </div>
      <div className="pm-mobile-card-actions">
        {onEditProduct && (
          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => onEditProduct(item)}>
            <Pencil size={14} /> Edit
          </button>
        )}
        {status === 'live' && (
          <>
            <button
              type="button"
              className="adm-btn-ghost adm-btn--sm"
              title={item.isNew ? 'Remove from New Arrivals' : 'Add to New Arrivals'}
              style={{ color: item.isNew ? '#0f766e' : undefined }}
              onClick={() => mutations.setNewArrival.mutate(
                { sku: item.sku, isNewArrival: !item.isNew },
                {
                  onSuccess: () => {
                    onRefreshStats?.();
                    onShowToast?.(item.isNew ? 'Removed from New Arrivals' : 'Added to New Arrivals');
                  },
                  onError: (err) => onShowToast?.(err.message, 'error'),
                },
              )}
            >
              <Sparkles size={14} />
            </button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.archive.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Archive</button>
            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => recycleSku(item.sku, false)}>Recycle</button>
          </>
        )}
        {status === 'archived' && (
          <>
            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => onMakeLive?.(item)}>
              <ArchiveRestore size={14} /> Make live
            </button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => recycleSku(item.sku, true)}>To recycle</button>
          </>
        )}
        {status === 'approval' && (
          <>
            <button
              type="button"
              className="adm-btn-red adm-btn--sm"
              disabled={item.stockReady === false || mutations.setLive.isPending}
              onClick={() => mutations.setLive.mutate(item.sku, {
                onSuccess: () => onRefreshStats?.(),
                onError: (err) => onShowToast?.(err.message, 'error'),
              })}
            >
              {mutations.setLive.isPending ? <Loader2 size={14} className="spin" /> : null}
              Set live
            </button>
            <button
              type="button"
              className="adm-btn-ghost adm-btn--sm"
              disabled={mutations.discardPreview.isPending}
              onClick={() => mutations.discardPreview.mutate(item.sku, {
                onError: (err) => onShowToast?.(err.message, 'error'),
              })}
            >
              Discard
            </button>
          </>
        )}
        {status === 'recycle' && (
          <>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.restoreRecycle.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>
              <ArchiveRestore size={14} /> Restore
            </button>
            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => mutations.permanentDelete.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Delete</button>
          </>
        )}
      </div>
    </article>
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

function scrollToPageTop() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function withCurrentOption(options, currentId) {
  if (!currentId || options.some((o) => o.id === currentId)) return options;
  return [{ id: currentId, label: `${currentId} (missing)` }, ...options];
}

function productCategoryRowFromItem(item, tree) {
  const path = item.categoryPath || [];
  return {
    categoryId: path[0] || tree[0]?.id || '',
    childOneId: path[1] || '',
    childTwoId: path[2] || '',
    childThreeId: path[3] || '',
    childFourId: path[4] || '',
  };
}

function productListTitle(item, status) {
  const name = String(item.title || item.name || '').trim();
  if (name) return name;
  if (status === 'archived') return '—';
  return item.sku || '—';
}

function CodeEllipsis({ value, prefix = '' }) {
  const text = String(value || '').trim();
  if (!text) return <span>{prefix}—</span>;
  return (
    <span className="pm-code-ellipsis" title={text}>
      {prefix}
      {text}
    </span>
  );
}

export default function ProductManagerEngine({
  taxonomyTree = [],
  onShowToast,
  onRefreshStats,
  onEditProduct,
  onImageFix,
  onEditCategory,
  onAddCategory,
  onAddSubcategory,
  onDeleteSubcategory,
  onDeleteNode,
  onRefreshTaxonomy,
  onCategoryReorder,
  categoryProductCounts = {},
  initialStatus = 'live',
}) {
  const [status, setStatus] = useState(initialStatus);
  const [archiveStockView, setArchiveStockView] = useState('archived');
  const [archiveSourceFilter, setArchiveSourceFilter] = useState('all');
  const [reorderMode, setReorderMode] = useState(false);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [searchInput, setSearchInput] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(() => readOnlyInStockPref());
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryPath, setCategoryPath] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [reorderProducts, setReorderProducts] = useState([]);
  const [reorderExpectedTotal, setReorderExpectedTotal] = useState(null);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [sortOrderMeta, setSortOrderMeta] = useState({ updatedAt: null, storeUpdatedAt: null });
  const storeUpdatedAtRef = useRef(null);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [catalogChangedWhileDirty, setCatalogChangedWhileDirty] = useState(false);
  const [reorderResyncNonce, setReorderResyncNonce] = useState(0);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingSelected, setExportingSelected] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);
  const [selectAllView, setSelectAllView] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [makeLiveItem, setMakeLiveItem] = useState(null);
  const [makeLiveCategory, setMakeLiveCategory] = useState({
    categoryId: '',
    childOneId: '',
    childTwoId: '',
    childThreeId: '',
    childFourId: '',
  });
  const [makeLiveSaving, setMakeLiveSaving] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryStackNav, setCategoryStackNav] = useState(null);
  const selectedRowsRef = useRef(new Map());
  const lastSelectIdxRef = useRef(null);
  const rowsRef = useRef([]);
  const panelTopRef = useRef(null);
  const reorderSaveTimerRef = useRef(null);
  const pendingReorderSaveRef = useRef(null);
  const reorderSyncKeyRef = useRef('');
  const catalogTotalWhileDirtyRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 900px)');

  const mutations = useCatalogMutations();
  const showStockColumn = STOCK_STATUSES.has(status);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    // Seed prevStatus from current state so we never fire on initial subscribe —
    // only a genuine running → complete transition should show the toast.
    let prevStatus = getActiveImageBatch()?.status ?? null;
    return subscribeImageBatch((batch) => {
      const nextStatus = batch?.status ?? null;
      if (prevStatus === 'running' && nextStatus === 'complete') {
        window.dispatchEvent(new CustomEvent('proto-approval-refresh'));
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
        if (status === 'approval') {
          onShowToast?.('New images ready for approval', 'success');
        }
      }
      prevStatus = nextStatus;
    });
  }, [status, onShowToast]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    selectedRowsRef.current = new Map();
    lastSelectIdxRef.current = null;
    setSelectAllView(false);
  }, [status, debouncedSearch, categoryPath.join('/'), archiveStockView, archiveSourceFilter, onlyInStock]);

  const handleOnlyInStockChange = useCallback((next) => {
    setOnlyInStock(next);
    try {
      sessionStorage.setItem(ONLY_IN_STOCK_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
  }, []);

  // Category badges must match what the list shows: when the stock toggle is
  // on, load stock-filtered counts; otherwise the parent-supplied counts
  // (all live rows) already match the default view.
  const [inStockCounts, setInStockCounts] = useState(null);
  useEffect(() => {
    if (!(status === 'live' && onlyInStock)) {
      setInStockCounts(null);
      return undefined;
    }
    let cancelled = false;
    fetchCategoryProductCounts({ onlyInStock: true })
      .then((counts) => { if (!cancelled) setInStockCounts(counts); })
      .catch(() => { /* keep unfiltered counts as fallback */ });
    return () => { cancelled = true; };
  }, [status, onlyInStock]);
  const effectiveCategoryCounts = status === 'live' && onlyInStock && inStockCounts
    ? inStockCounts
    : categoryProductCounts;

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    lastSelectIdxRef.current = null;
    scrollToPageTop();
  }, []);

  const catalogParams = useMemo(() => buildCatalogParams({
    status,
    page,
    pageSize,
    search: debouncedSearch,
    categoryPath,
    stockFilter: status === 'archived' ? archiveStockView : undefined,
    archivedSource: status === 'archived' && archiveStockView === 'archived' ? archiveSourceFilter : undefined,
    onlyInStock: status === 'live' && onlyInStock,
  }), [status, page, pageSize, debouncedSearch, categoryPath, archiveStockView, archiveSourceFilter, onlyInStock]);

  const catalogQueryEnabled = status !== 'approval';

  const { data, isLoading, isFetching, isPlaceholderData } = useCatalogQuery(catalogParams, {
    enabled: catalogQueryEnabled,
  });
  const rowsStale = Boolean(data && data.page !== page);
  const rows = rowsStale ? [] : (data?.rows || []);
  rowsRef.current = rows;
  const total = data?.total || 0;
  const archiveNegativeLive = status === 'archived' && archiveStockView === 'negative';
  const tree = taxonomyTree.length ? taxonomyTree : (data?.tree || []);

  const categoryKey = categoryPath.length
    ? sortOrderCategoryKey(categoryPath, tree)
    : '__all__';

  useEffect(() => {
    for (const row of rows) {
      if (selectedRowsRef.current.has(row.id)) {
        selectedRowsRef.current.set(row.id, row);
      }
    }
  }, [rows, page]);

  const loadSortOrder = useCallback(async (baseRows) => {
    if (!categoryPath.length || categoryKey === '__all__') return;
    try {
      const store = await fetchSortOrderStore({ force: true });
      const meta = sortMetaForPath(store, categoryPath, tree);
      setSortOrderMeta({ updatedAt: meta.updatedAt, storeUpdatedAt: store.updatedAt || null });
      storeUpdatedAtRef.current = store.updatedAt || null;
      const skuOrder = lookupSortOrder(store.orders || {}, categoryPath, tree);
      if (skuOrder?.length && baseRows?.length) {
        setReorderProducts(applySkuOrder(baseRows, skuOrder));
      }
    } catch { /* ignore */ }
  }, [categoryPath, categoryKey, tree]);

  const reorderSyncKey = `${reorderMode}|${status}|${categoryKey}`;

  useEffect(() => {
    if (!reorderMode || status !== 'live' || !categoryPath.length || categoryKey === '__all__') {
      reorderSyncKeyRef.current = '';
      setReorderExpectedTotal(null);
      setCatalogChangedWhileDirty(false);
      catalogTotalWhileDirtyRef.current = null;
      return undefined;
    }

    const syncKeyChanged = reorderSyncKeyRef.current !== reorderSyncKey;
    if (!syncKeyChanged && reorderDirty) return undefined;
    reorderSyncKeyRef.current = reorderSyncKey;

    let cancelled = false;
    setReorderLoading(true);
    setCatalogChangedWhileDirty(false);
    catalogTotalWhileDirtyRef.current = data?.total ?? null;
    fetchAllCatalogRows({ status: 'live', categoryPath, search: '', onlyInStock: false })
      .then((allRows) => {
        if (cancelled) return;
        setReorderExpectedTotal(allRows.length);
        setReorderProducts(allRows);
        setReorderDirty(false);
        void loadSortOrder(allRows);
      })
      .catch(() => {
        if (!cancelled) onShowToast?.('Failed to load full category for reorder', 'error');
      })
      .finally(() => {
        if (!cancelled) setReorderLoading(false);
      });
    return () => { cancelled = true; };
  }, [reorderSyncKey, reorderResyncNonce, reorderDirty, categoryPath, categoryKey, status, loadSortOrder, onShowToast, data?.total]);

  useEffect(() => {
    if (!reorderMode || status !== 'live' || !reorderDirty) return;
    const t = data?.total;
    if (t == null) return;
    if (catalogTotalWhileDirtyRef.current != null && catalogTotalWhileDirtyRef.current !== t) {
      setCatalogChangedWhileDirty(true);
    }
    catalogTotalWhileDirtyRef.current = t;
  }, [data?.total, reorderMode, status, reorderDirty]);

  const discardDirtyReorderSync = useCallback(() => {
    setCatalogChangedWhileDirty(false);
    setReorderDirty(false);
    reorderSyncKeyRef.current = '';
    catalogTotalWhileDirtyRef.current = null;
    setReorderResyncNonce((n) => n + 1);
  }, []);

  const reorderIncomplete = reorderExpectedTotal != null
    && reorderProducts.length !== reorderExpectedTotal;

  const handleReorderProductsChange = useCallback((nextOrFn) => {
    setReorderProducts((prev) => (typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn));
    setReorderDirty(true);
  }, []);

  const saveReorderOrder = async () => {
    if (debouncedSearch) {
      onShowToast?.('Clear search before saving sort order', 'error');
      return;
    }
    if (reorderIncomplete) {
      onShowToast?.('Category incomplete — reload before saving', 'error');
      return;
    }
    setReorderSaving(true);
    try {
      await persistOrder(reorderProducts);
      setReorderDirty(false);
    } finally {
      setReorderSaving(false);
    }
  };

  const persistOrder = async (next) => {
    if (!categoryKey || categoryKey === '__all__') {
      onShowToast?.('Select a category before saving sort order', 'error');
      return;
    }
    if (reorderExpectedTotal != null && next.length !== reorderExpectedTotal) {
      onShowToast?.('Category incomplete — reload before saving', 'error');
      return;
    }
    const skuOrder = next.map((p) => p.id);
    try {
      const json = await persistSortOrder({
        categoryKey,
        skuOrder,
        legacyKeys: sortOrderLookupKeys(categoryPath, tree).filter((k) => k !== categoryKey),
        expectedStoreUpdatedAt: storeUpdatedAtRef.current,
      });
      setSortOrderMeta({ updatedAt: json.updatedAt, storeUpdatedAt: json.storeUpdatedAt || null });
      storeUpdatedAtRef.current = json.storeUpdatedAt || null;
      setTimeout(() => {
        void fetchSortMetaForCategory(categoryKey).then((meta) => {
          if (!meta?.updatedAt) return;
          setSortOrderMeta({ updatedAt: meta.updatedAt, storeUpdatedAt: meta.storeUpdatedAt || null });
          storeUpdatedAtRef.current = meta.storeUpdatedAt || null;
        });
      }, 5000);
      setReorderDirty(false);
      onShowToast?.('Sort order saved — live site updates within ~30s', 'success');
    } catch (err) {
      if (err.status === 409) {
        onShowToast?.(err.message || 'Reorder conflict — reload', 'error');
        void loadSortOrder(rowsRef.current);
        return;
      }
      onShowToast?.(err.message || 'Failed to save sort order', 'error');
      setReorderDirty(true);
    }
  };

  const scheduleReorderSave = useCallback((orderedProducts) => {
    pendingReorderSaveRef.current = orderedProducts;
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
    reorderSaveTimerRef.current = setTimeout(() => {
      const pending = pendingReorderSaveRef.current;
      pendingReorderSaveRef.current = null;
      if (pending) void persistOrder(pending);
    }, 600);
  }, [categoryKey, categoryPath, tree, onShowToast, loadSortOrder]);

  useEffect(() => () => {
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
  }, []);

  const confirmBulkMove = async ({ categoryPathIds, categoryId, subcategoryId, destinationLabel }) => {
    const skus = [...selected];
    if (!skus.length || categoryPathIds.length < 2) {
      onShowToast?.('Choose a main category and at least one subcategory', 'error');
      return;
    }
    if (!window.confirm(`Move ${skus.length} product(s) to:\n${destinationLabel}?`)) return;
    setMoveSaving(true);
    if (skus.length > LARGE_BULK_MOVE_THRESHOLD) {
      onShowToast?.(`Moving ${skus.length} products…`, 'info');
    }
    try {
      await bulkMoveProducts({ skus, categoryId, subcategoryId, categoryPathIds });
      setMoveModalOpen(false);
      clearSelection();
      setCategoryPath(categoryPathIds);
      invalidateAdminCache();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
      onRefreshStats?.();
      onShowToast?.(`Moved ${skus.length} product(s) to ${destinationLabel}`, 'success');
    } catch (err) {
      if (err.status === 409) {
        setMoveModalOpen(false);
        clearSelection();
        onRefreshTaxonomy?.();
        onShowToast?.(err.message || 'Categories changed — reload and reselect', 'error');
      } else if (err.partial) {
        setMoveModalOpen(false);
        clearSelection();
        invalidateAdminCache();
        queryClient.invalidateQueries({ queryKey: ['catalog'] });
        onShowToast?.(err.message || 'Move failed', 'warning');
      } else {
        onShowToast?.(err.message || 'Move failed', 'error');
      }
    } finally {
      setMoveSaving(false);
    }
  };

  const handleProductSelect = useCallback((id, item, index, { shiftKey = false, ctrlKey = false } = {}) => {
    setSelectAllView(false);
    const currentRows = rowsRef.current;
    const idx = index !== null && index >= 0 ? index : null;

    if (shiftKey && lastSelectIdxRef.current !== null && idx !== null) {
      const start = Math.min(lastSelectIdxRef.current, idx);
      const end = Math.max(lastSelectIdxRef.current, idx);
      const rangeRows = currentRows.slice(start, end + 1);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of rangeRows) {
          next.add(row.id);
          selectedRowsRef.current.set(row.id, row);
        }
        return next;
      });
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        selectedRowsRef.current.delete(id);
      } else {
        next.add(id);
        if (item) selectedRowsRef.current.set(id, item);
      }
      return next;
    });
    if (!ctrlKey && idx !== null) lastSelectIdxRef.current = idx;
  }, []);

  const onProductCheckboxClick = useCallback((e, id, item, index) => {
    e.stopPropagation();
    handleProductSelect(id, item, index, {
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
    });
  }, [handleProductSelect]);

  const onProductRowShiftClick = useCallback((e, id, item, index) => {
    if (!e.shiftKey) return;
    if (e.target.closest('button, a, input, label, .adm-icon-btn')) return;
    e.preventDefault();
    handleProductSelect(id, item, index, { shiftKey: true });
  }, [handleProductSelect]);

  const toggleSelect = (id, item, opts = {}) => {
    handleProductSelect(id, item, opts.index ?? null, {
      shiftKey: opts.shiftKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
    });
  };

  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedOnPage = rows.filter((r) => selected.has(r.id)).length;

  const clearSelection = () => {
    setSelected(new Set());
    selectedRowsRef.current = new Map();
    lastSelectIdxRef.current = null;
    setSelectAllView(false);
  };

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectAllView(false);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const item of rows) {
          next.delete(item.id);
          selectedRowsRef.current.delete(item.id);
        }
        return next;
      });
      return;
    }
    setSelectAllView(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of rows) {
        next.add(item.id);
        selectedRowsRef.current.set(item.id, item);
      }
      return next;
    });
  };

  const selectAllInView = async () => {
    setSelectingAll(true);
    try {
      const allRows = await fetchAllCatalogRows({
        status,
        search: debouncedSearch,
        categoryPath,
        stockFilter: status === 'archived' ? archiveStockView : undefined,
        archivedSource: status === 'archived' && archiveStockView === 'archived' ? archiveSourceFilter : undefined,
      });
      selectedRowsRef.current = new Map(allRows.map((r) => [r.id, r]));
      setSelected(new Set(allRows.map((r) => r.id)));
      setSelectAllView(true);
      onShowToast?.(`Selected ${allRows.length} product(s)`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Failed to select all', 'error');
    } finally {
      setSelectingAll(false);
    }
  };

  const bulkArchiveSelected = async () => {
    const skus = [...selected];
    if (!skus.length) return;
    const noun = skus.length === 1 ? 'product' : 'products';
    if (!window.confirm(`Archive ${skus.length} selected ${noun}? They will be hidden from the trade website.`)) return;
    setBulkActionPending(true);
    try {
      await mutations.bulkArchive.mutateAsync(skus);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      onRefreshStats?.();
      onShowToast?.(`Archived ${skus.length} ${noun}`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Bulk archive failed', 'error');
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleImageFix = () => {
    const products = [...selected]
      .map((id) => selectedRowsRef.current.get(id))
      .filter(Boolean);
    if (!products.length) {
      onShowToast?.('Select at least one product', 'error');
      return;
    }
    onImageFix?.(products);
    setSelected(new Set());
    selectedRowsRef.current = new Map();
  };

  const bulkEditProducts = useMemo(
    () => [...selected].map((id) => selectedRowsRef.current.get(id)).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bulkEditOpen, selected],
  );

  const handleBulkEditSaved = () => {
    setSelected(new Set());
    selectedRowsRef.current = new Map();
    setBulkEditOpen(false);
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    onRefreshStats?.();
  };

  const runBulk = async (action, { successMessage } = {}) => {
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
      onShowToast?.(successMessage || `${skus.length} updated`, 'success');
    }
  };

  const makeLive = (item) => {
    setMakeLiveItem(item);
    setMakeLiveCategory(productCategoryRowFromItem(item, tree));
  };

  const confirmMakeLive = async () => {
    if (!makeLiveItem || makeLiveSaving) return;
    const path = [
      makeLiveCategory.categoryId,
      makeLiveCategory.childOneId,
      makeLiveCategory.childTwoId,
      makeLiveCategory.childThreeId,
      makeLiveCategory.childFourId,
    ].filter(Boolean);
    if (!path.length) {
      onShowToast?.('Pick a main category before making live', 'error');
      return;
    }
    const name = productListTitle(makeLiveItem, 'archived');
    setMakeLiveSaving(true);
    try {
      await updateProduct(makeLiveItem.sku, { categoryPath: path });
      await mutations.unarchive.mutateAsync(makeLiveItem.sku);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      onRefreshStats?.();
      const zeroStock = (makeLiveItem.stockOnHand ?? makeLiveItem.stockQty ?? 0) === 0;
      onShowToast?.(
        zeroStock
          ? `"${name}" is live with 0 stock — set price and stock on hand to complete.`
          : `"${name}" is now live on the website`,
        'success',
      );
      setMakeLiveItem(null);
    } catch (err) {
      onShowToast?.(err.message || 'Make live failed', 'error');
    } finally {
      setMakeLiveSaving(false);
    }
  };

  const bulkMakeLive = async () => {
    const skus = [...selected];
    if (!skus.length) return;
    const noun = skus.length === 1 ? 'product' : 'products';
    if (!window.confirm(`Make ${skus.length} selected ${noun} live on the website?`)) return;
    setBulkActionPending(true);
    try {
      await mutations.bulkUnarchive.mutateAsync(skus);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      onRefreshStats?.();
      onShowToast?.(`${skus.length} ${noun} now live`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Bulk restore failed', 'error');
    } finally {
      setBulkActionPending(false);
    }
  };

  const recycleSku = (sku, fromArchive) => mutations.softDelete.mutate(
    { sku, fromArchive },
    { onSuccess: () => onRefreshStats?.() },
  );

  const handleExportCatalog = async (allStatuses = false) => {
    setExportingXlsx(true);
    try {
      const count = allStatuses
        ? await exportAllProductsCatalogXlsx({ taxonomyTree })
        : await exportProductsCatalogXlsx({ status, taxonomyTree });
      onShowToast?.(`Exported ${count} product${count === 1 ? '' : 's'} with full categories`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Export failed', 'error');
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleExportSelected = async () => {
    const products = [...selected]
      .map((id) => selectedRowsRef.current.get(id))
      .filter(Boolean);
    if (!selected.size) {
      onShowToast?.('Select at least one product', 'error');
      return;
    }
    setExportingSelected(true);
    try {
      const count = await exportSelectedProductsXlsx(products, {
        status,
        taxonomyTree,
        selectedIds: [...selected],
      });
      onShowToast?.(`Exported ${count} selected product${count === 1 ? '' : 's'} to Excel`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Export failed', 'error');
    } finally {
      setExportingSelected(false);
    }
  };

  const showSkeleton = (isLoading && !isPlaceholderData && !data) || (rowsStale && isFetching);
  const addSubParentId = categoryPath[0] || tree[0]?.id || '';
  const categoryLabels = useMemo(() => resolvePathLabels(tree, categoryPath), [tree, categoryPath]);
  const categoryFilterLabel = categoryLabels.length
    ? categoryLabels.join(' › ')
    : 'All categories';

  useEffect(() => {
    if (!categoryDrawerOpen) {
      setCategoryStackNav(null);
    }
  }, [categoryDrawerOpen]);

  useEffect(() => {
    if (!categoryDrawerOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [categoryDrawerOpen]);

  const handleCategoryStackNavChange = useCallback((nav) => {
    setCategoryStackNav(nav);
  }, []);

  const handleCategorySelect = useCallback((path) => {
    setCategoryPath(path);
    if (isMobile) setCategoryDrawerOpen(false);
  }, [isMobile]);

  return (
    <div ref={panelTopRef} className="adm-panel adm-panel-with-sidebar pm-engine">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Product Manager</h2>
          <p className="adm-section-note">In-stock products are live on the site. Use ✨ to add products to New Arrivals on the trade homepage.</p>
        </div>
        <div className="pm-engine-head-actions">
          {status !== 'approval' && !reorderMode && (
            <>
              <button
                type="button"
                className="adm-btn-ghost adm-btn--sm"
                disabled={exportingXlsx}
                onClick={() => void handleExportCatalog(false)}
                title="Export current tab with all category levels and product fields"
              >
                {exportingXlsx ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}
                {exportingXlsx ? 'Exporting…' : 'Export Excel'}
              </button>
              <button
                type="button"
                className="adm-btn-ghost adm-btn--sm"
                disabled={exportingXlsx}
                onClick={() => void handleExportCatalog(true)}
                title="Export live + archived + recycle in one file, plus category tree sheet"
              >
                {exportingXlsx ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />}
                Export all
              </button>
            </>
          )}
          {isFetching && !isLoading && <Loader2 size={16} className="spin" aria-label="Refreshing" />}
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
            onClick={() => { setReorderMode((v) => !v); setReorderDirty(false); }}
          >
            <Grip size={14} /> Reorder mode
          </button>
        )}
      </div>

      {status === 'approval' ? (
        <ApprovalPanel
          embedded
          onShowToast={onShowToast}
          onRefreshStats={onRefreshStats}
        />
      ) : (
        <div className="adm-panel-split">
          <aside className={`adm-panel-sidebar adm-reorder-tree-sidebar${isMobile ? ' adm-panel-sidebar--desktop-only' : ''}`}>
            <div className="adm-reorder-cat-heading">
              <span>Categories</span>
              <span style={{ display: 'inline-flex', gap: 4, marginLeft: 'auto' }}>
                {onAddSubcategory && addSubParentId && (
                  <button
                    type="button"
                    className="adm-taxonomy-add-btn"
                    title="Add subcategory to selected category"
                    onClick={() => onAddSubcategory(addSubParentId)}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                )}
                {onAddCategory && (
                  <button
                    type="button"
                    className="adm-taxonomy-add-btn"
                    title="Add new category"
                    onClick={() => onAddCategory()}
                  >
                    <FolderPlus size={16} strokeWidth={2.5} />
                  </button>
                )}
              </span>
            </div>
            <CategorySidebar
              tree={tree}
              selectedPath={categoryPath}
              onSelectPath={handleCategorySelect}
              onEditNode={onEditCategory}
              onDeleteNode={onDeleteNode}
              onAddChild={onAddSubcategory}
              onReorder={onCategoryReorder}
              productCounts={effectiveCategoryCounts}
            />
          </aside>
          <div className="adm-panel-main">
            {isMobile && (
              <div className="pm-mobile-cat-bar">
                <button
                  type="button"
                  className="pm-cat-trigger"
                  onClick={() => setCategoryDrawerOpen(true)}
                >
                  <FolderTree size={18} />
                  <span className="pm-cat-trigger-label">{categoryFilterLabel}</span>
                  <ChevronRight size={18} className="pm-cat-trigger-chevron" />
                </button>
                {categoryPath.length > 0 && (
                  <button
                    type="button"
                    className="pm-cat-clear"
                    onClick={() => setCategoryPath([])}
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}
            <div className="adm-toolbar pm-toolbar">
              {status === 'archived' && (
                <>
                  <p className="adm-section-note" style={{ margin: '0 0 8px', width: '100%' }}>
                    {archiveStockView === 'negative'
                      ? 'Live products with negative ERP stock. Zero-stock items are not shown here.'
                      : 'Archived products hidden from the trade website. Zero-stock items are not shown here.'}
                  </p>
                  <div className="pm-archive-stock-toggle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', marginBottom: 8 }}>
                    <button
                      type="button"
                      className={`adm-btn-ghost adm-btn--sm${archiveStockView === 'archived' ? ' adm-tab--active' : ''}`}
                      onClick={() => setArchiveStockView('archived')}
                    >
                      Archived
                    </button>
                    <button
                      type="button"
                      className={`adm-btn-ghost adm-btn--sm${archiveStockView === 'negative' ? ' adm-tab--active' : ''}`}
                      onClick={() => setArchiveStockView('negative')}
                    >
                      Negative stock
                    </button>
                    {archiveStockView === 'archived' && (
                      <>
                        <button
                          type="button"
                          className={`adm-btn-ghost adm-btn--sm${archiveSourceFilter === 'all' ? ' adm-tab--active' : ''}`}
                          onClick={() => setArchiveSourceFilter('all')}
                        >
                          All archived
                        </button>
                        <button
                          type="button"
                          className={`adm-btn-ghost adm-btn--sm${archiveSourceFilter === 'nutstore' ? ' adm-tab--active' : ''}`}
                          onClick={() => setArchiveSourceFilter('nutstore')}
                        >
                          Nutstore
                        </button>
                        <button
                          type="button"
                          className={`adm-btn-ghost adm-btn--sm${archiveSourceFilter === 'other' ? ' adm-tab--active' : ''}`}
                          onClick={() => setArchiveSourceFilter('other')}
                        >
                          Other
                        </button>
                      </>
                    )}
                    {!isLoading && (
                      <span className="adm-pill" style={{ marginLeft: 'auto', fontSize: 12 }}>
                        {total} product{total === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </>
              )}
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
              {status === 'live' && (
                <label className="adm-filter-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={onlyInStock}
                    onChange={(e) => handleOnlyInStockChange(e.target.checked)}
                    style={{ accentColor: '#8B1A1A' }}
                  />
                  Show only in stock
                </label>
              )}
              {rows.length > 0 && status !== 'approval' && !reorderMode && (
                <div className="pm-select-toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
                  <button
                    type="button"
                    className="adm-btn-ghost adm-btn--sm"
                    onClick={toggleSelectAllPage}
                  >
                    {allPageSelected ? `Deselect page (${rows.length})` : `Select page (${rows.length})`}
                  </button>
                  {total > rows.length && (
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn--sm"
                      disabled={selectingAll}
                      onClick={() => void selectAllInView()}
                    >
                      {selectingAll ? <><Loader2 size={14} className="spin" /> Loading…</> : `Select all (${total})`}
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={clearSelection}>
                      Clear
                    </button>
                  )}
                </div>
              )}
              {allPageSelected && total > rows.length && !selectAllView && (
                <div className="pm-select-all-banner adm-bulk-bar" style={{ width: '100%', marginBottom: 0 }}>
                  <span>All {rows.length} on this page selected.</span>
                  <button
                    type="button"
                    className="adm-bulk-bar__link"
                    disabled={selectingAll}
                    onClick={() => void selectAllInView()}
                  >
                    {selectingAll ? 'Loading…' : `Select all ${total} in this view`}
                  </button>
                </div>
              )}
              {selectAllView && selected.size > 0 && (
                <div className="pm-select-all-banner adm-bulk-bar" style={{ width: '100%', marginBottom: 0 }}>
                  <span>All {selected.size} products in this view are selected.</span>
                  <button type="button" className="adm-bulk-bar__link" onClick={clearSelection}>Clear selection</button>
                </div>
              )}
              {selected.size > 0 && (
                <div className="pm-bulk-bar">
                  <span>
                    {selected.size} selected
                    {total > rows.length && selectedOnPage < selected.size && (
                      <> · {selectedOnPage} on this page</>
                    )}
                  </span>
                  <button
                    type="button"
                    className="adm-btn-ghost adm-btn--sm"
                    disabled={exportingSelected || exportingXlsx}
                    onClick={() => void handleExportSelected()}
                  >
                    {exportingSelected
                      ? <><Loader2 size={14} className="spin" /> Exporting…</>
                      : <><FileSpreadsheet size={14} /> Export selected</>}
                  </button>
                  {(status === 'live' || (status === 'archived' && !archiveNegativeLive)) && selected.size > 0 && (
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn--sm"
                      onClick={() => setMoveModalOpen(true)}
                    >
                      Move
                    </button>
                  )}
                  {(status === 'live' || status === 'archived') && (
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn--sm"
                      onClick={() => setBulkEditOpen(true)}
                    >
                      <Pencil size={14} /> Bulk edit
                    </button>
                  )}
                  {(status === 'live' || status === 'archived') && onImageFix && (
                    <button type="button" className="adm-btn-red adm-btn--sm" onClick={handleImageFix}>
                      <Sparkles size={14} /> Image fix
                    </button>
                  )}
                  {status === 'live' && (
                    <>
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm"
                        disabled={bulkActionPending}
                        onClick={() => void bulkArchiveSelected()}
                      >
                        {bulkActionPending ? 'Archiving…' : `Archive ${selected.size}`}
                      </button>
                      <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => runBulk({ mutateAsync: (sku) => mutations.softDelete.mutateAsync({ sku, fromArchive: false }) })}>To recycle</button>
                    </>
                  )}
                  {status === 'archived' && archiveNegativeLive && (
                    <>
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm"
                        disabled={bulkActionPending}
                        onClick={() => void bulkArchiveSelected()}
                      >
                        {bulkActionPending ? 'Archiving…' : `Archive ${selected.size}`}
                      </button>
                      <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => runBulk({ mutateAsync: (sku) => mutations.softDelete.mutateAsync({ sku, fromArchive: false }) })}>To recycle</button>
                    </>
                  )}
                  {status === 'archived' && !archiveNegativeLive && (
                    <>
                      <button
                        type="button"
                        className="adm-btn-red adm-btn--sm"
                        disabled={bulkActionPending}
                        onClick={() => void bulkMakeLive()}
                      >
                        {bulkActionPending
                          ? 'Restoring…'
                          : (
                            <>
                              <ArchiveRestore size={14} />
                              {' '}
                              Make {selected.size} live
                            </>
                          )}
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => runBulk({ mutateAsync: (sku) => mutations.softDelete.mutateAsync({ sku, fromArchive: true }) })}>To recycle</button>
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
              <>
                <div className="adm-reorder-toolbar" style={{ marginBottom: 12 }}>
                  <span className="adm-reorder-count">{reorderProducts.length} products in this view</span>
                  {sortOrderMeta.updatedAt && formatSortSavedAt(sortOrderMeta.updatedAt) && (
                    <span className="adm-pill adm-pill--ok">
                      Order saved · {formatSortSavedAt(sortOrderMeta.updatedAt)}
                    </span>
                  )}
                  {reorderDirty && <span className="adm-pill adm-pill--warn">Unsaved order</span>}
                  {debouncedSearch && <span className="adm-muted" style={{ fontSize: 12 }}>Clear search to save</span>}
                  {catalogChangedWhileDirty && (
                    <span className="adm-pill adm-pill--warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      Catalogue changed — reload to sync
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm"
                        onClick={() => discardDirtyReorderSync()}
                      >
                        Reload
                      </button>
                    </span>
                  )}
                  {reorderIncomplete && (
                    <span className="adm-pill adm-pill--warn">Category incomplete — reload before saving</span>
                  )}
                  <button
                    type="button"
                    className="adm-btn-red adm-btn--sm"
                    style={{ marginLeft: 'auto' }}
                    disabled={!reorderDirty || reorderSaving || !!debouncedSearch || reorderIncomplete}
                    onClick={() => void saveReorderOrder()}
                  >
                    {reorderSaving ? 'Saving…' : 'Save order'}
                  </button>
                </div>
              <ReorderGrid
                products={reorderProducts}
                onProductsChange={handleReorderProductsChange}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                mainCategoryId={categoryPath[0] || tree[0]?.id}
                selectedPath={categoryPath}
                taxonomyTree={tree}
                loading={reorderLoading}
                dragDisabled={!!debouncedSearch}
                savingOrder={reorderSaving}
                onEditProduct={onEditProduct}
                onEditSubcategory={onEditCategory}
                onDeleteSubcategory={onDeleteSubcategory}
                onOrderCommitted={(next) => scheduleReorderSave(next)}
              />
              </>
            ) : (
              <>
                {isMobile ? (
                  <div className="pm-mobile-list">
                    {rows.map((item, index) => (
                      <PmMobileProductCard
                        key={item.id}
                        item={item}
                        index={index}
                        status={archiveNegativeLive ? 'live' : status}
                        selected={selected}
                        showStockColumn={showStockColumn}
                        onCheckboxClick={onProductCheckboxClick}
                        onRowShiftClick={onProductRowShiftClick}
                        onEditProduct={onEditProduct}
                        onMakeLive={makeLive}
                        mutations={mutations}
                        onRefreshStats={onRefreshStats}
                        recycleSku={recycleSku}
                        onShowToast={onShowToast}
                        tree={tree}
                      />
                    ))}
                    {!rows.length && !isLoading && (
                      <p className="adm-empty">
                        {status === 'archived' && archiveStockView === 'negative'
                          ? 'No live products with negative stock.'
                          : status === 'archived'
                            ? 'No archived products (zero-stock items are hidden).'
                            : 'No products in this view.'}
                      </p>
                    )}
                  </div>
                ) : (
                <>
                <p className="adm-muted pm-shift-hint" style={{ fontSize: 12, margin: '0 0 8px' }}>
                  Checkboxes to select · <strong>Shift+click</strong> a second row/checkbox for a range · <strong>Ctrl/Cmd+click</strong> to toggle without moving the anchor
                </p>
                <div className="adm-list pm-list">
                  <div
                    className="adm-list-head pm-list-head"
                    style={{ gridTemplateColumns: ROW_COLUMNS[status] || ROW_COLUMNS.live }}
                  >
                    <span>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                        aria-label="Select all products on this page"
                      />
                    </span>
                    <span />
                    <span>Product</span>
                    {showStockColumn && <span>Stock</span>}
                    <span>Actions</span>
                  </div>
                  {rows.map((item, index) => (
                    <div
                      key={item.id}
                      className={`adm-list-row${selected.has(item.id) ? ' adm-list-row--selected' : ''}`}
                      style={{ gridTemplateColumns: ROW_COLUMNS[status] || ROW_COLUMNS.live }}
                      onClick={(e) => onProductRowShiftClick(e, item.id, item, index)}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onClick={(e) => onProductCheckboxClick(e, item.id, item, index)}
                          readOnly
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
                          {productListTitle(item, status)}
                          {!item.image && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>
                          )}
                          {item.isNew && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#0f766e', borderRadius: 4, padding: '1px 5px' }}>New arrival</span>
                          )}
                          <NutstoreArchiveBadge archivedBy={item.archivedBy} />
                          <NeedsSohPriceBadge item={item} />
                          <OutOfStockLinkedBadge item={item} />
                          <MultiCategoryBadge item={item} tree={tree} />
                        </div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>
                          <span>BC: <CodeEllipsis value={item.barcode || item.code} /></span>
                          {item.sku && (
                            <span style={{ marginLeft: 8 }}>
                              WSK: <CodeEllipsis value={item.sku} />
                            </span>
                          )}
                          {item.price > 0 && (
                            <span title="Price incl. VAT" style={{ marginLeft: 8, fontWeight: 700, color: '#374151' }}>
                              R{formatWebsitePrice(item.price)}
                            </span>
                          )}
                        </div>
                        <ProductCategoryLine item={item} />
                        {status === 'approval' && item.stockError && (
                          <span className="adm-list-warn" style={{ fontSize: 11 }}>{item.stockError}</span>
                        )}
                      </div>
                      {showStockColumn && (
                        <div>
                          <span style={{
                            fontWeight: status === 'archived' ? 900 : 700,
                            fontSize: status === 'archived' ? 15 : undefined,
                            color: item.stockQty < 0
                              ? '#b91c1c'
                              : (status === 'archived' ? '#8B1A1A' : undefined),
                          }}
                          >
                            {formatStockUnits(item.stockQty)}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {onEditProduct && (
                          <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => onEditProduct(item)}>
                            <Pencil size={14} /> Edit
                          </button>
                        )}
                        {status === 'live' && (
                          <>
                            <button
                              type="button"
                              className="adm-btn-ghost adm-btn--sm"
                              title={item.isNew ? 'Remove from New Arrivals' : 'Add to New Arrivals'}
                              style={{ color: item.isNew ? '#0f766e' : undefined }}
                              onClick={() => mutations.setNewArrival.mutate(
                                { sku: item.sku, isNewArrival: !item.isNew },
                                {
                                  onSuccess: () => {
                                    onRefreshStats?.();
                                    onShowToast?.(item.isNew ? 'Removed from New Arrivals' : 'Added to New Arrivals');
                                  },
                                  onError: (err) => onShowToast?.(err.message, 'error'),
                                },
                              )}
                            >
                              <Sparkles size={14} />
                            </button>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.archive.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Archive</button>
                            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => recycleSku(item.sku, false)}>To recycle</button>
                          </>
                        )}
                        {status === 'archived' && archiveNegativeLive && (
                          <>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.archive.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Archive</button>
                            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => recycleSku(item.sku, false)}>To recycle</button>
                          </>
                        )}
                        {status === 'archived' && !archiveNegativeLive && (
                          <>
                            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => makeLive(item)}>
                              <ArchiveRestore size={14} /> Make live
                            </button>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => recycleSku(item.sku, true)}>To recycle</button>
                          </>
                        )}
                        {status === 'approval' && (
                          <>
                            {onEditProduct && (
                              <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => onEditProduct(item)}>
                                <Pencil size={14} /> Edit
                              </button>
                            )}
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
                          <>
                            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => mutations.restoreRecycle.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>
                              <ArchiveRestore size={14} /> Restore
                            </button>
                            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => mutations.permanentDelete.mutate(item.sku, { onSuccess: () => onRefreshStats?.() })}>Delete forever</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {!rows.length && !isLoading && (
                    <p className="adm-empty">
                      {status === 'archived' && archiveStockView === 'negative'
                        ? 'No live products with negative stock.'
                        : status === 'archived'
                          ? 'No archived products (zero-stock items are hidden).'
                          : 'No products in this view.'}
                    </p>
                  )}
                </div>
                </>
                )}
                <Pager page={page} total={total} pageSize={pageSize} onPageChange={handlePageChange} />
              </>
            )}
          </div>
        </div>
      )}

      {isMobile && categoryDrawerOpen && (
        <>
          <button
            type="button"
            className="pm-cat-drawer-backdrop"
            aria-label="Close categories"
            onClick={() => setCategoryDrawerOpen(false)}
          />
          <div className="pm-cat-drawer" role="dialog" aria-modal="true" aria-label="Browse categories">
            <div className="pm-cat-drawer-head">
              {categoryStackNav?.canGoBack ? (
                <span className="pm-cat-drawer-head-title pm-cat-drawer-head-title--sub">
                  {categoryStackNav.currentFolderLabel}
                </span>
              ) : (
                <strong>Categories</strong>
              )}
              <div className="pm-cat-drawer-head-actions">
                {onAddSubcategory && addSubParentId && (
                  <button
                    type="button"
                    className="adm-taxonomy-add-btn"
                    title="Add subcategory"
                    onClick={() => onAddSubcategory(addSubParentId)}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                )}
                {onAddCategory && (
                  <button
                    type="button"
                    className="adm-taxonomy-add-btn"
                    title="Add category"
                    onClick={() => onAddCategory()}
                  >
                    <FolderPlus size={16} strokeWidth={2.5} />
                  </button>
                )}
                <button
                  type="button"
                  className="pm-cat-drawer-close"
                  aria-label="Close"
                  onClick={() => setCategoryDrawerOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {categoryStackNav?.canGoBack && (
              <div className="pm-cat-drawer-nav">
                <button
                  type="button"
                  className="pm-cat-drawer-back"
                  onClick={categoryStackNav.goBack}
                >
                  <ChevronLeft size={22} strokeWidth={2.5} />
                  <span>Back to {categoryStackNav.parentFolderLabel}</span>
                </button>
              </div>
            )}
            <CategorySidebar
              tree={tree}
              selectedPath={categoryPath}
              onSelectPath={handleCategorySelect}
              onEditNode={onEditCategory}
              onDeleteNode={onDeleteNode}
              onAddChild={onAddSubcategory}
              onReorder={onCategoryReorder}
              variant="stack"
              className="pm-cat-drawer-sidebar"
              isActive={categoryDrawerOpen}
              onStackNavChange={handleCategoryStackNavChange}
              productCounts={effectiveCategoryCounts}
            />
          </div>
        </>
      )}

      {bulkEditOpen && bulkEditProducts.length > 0 && (
        <BulkProductEditModal
          products={bulkEditProducts}
          taxonomyTree={tree}
          onClose={() => setBulkEditOpen(false)}
          onSaved={handleBulkEditSaved}
          onShowToast={onShowToast}
          onRefreshTaxonomy={onRefreshTaxonomy}
        />
      )}

      <BulkMoveModal
        open={moveModalOpen}
        count={selected.size}
        taxonomyTree={tree}
        initialCategoryId={categoryPath[0] || tree[0]?.id || ''}
        saving={moveSaving}
        onClose={() => setMoveModalOpen(false)}
        onConfirm={(payload) => void confirmBulkMove(payload)}
        onAddSubcategory={(parentId) => {
          setMoveModalOpen(false);
          onAddSubcategory?.(parentId);
        }}
      />

      {makeLiveItem && (
        <div className="adm-modal-backdrop" onClick={() => !makeLiveSaving && setMakeLiveItem(null)}>
          <div className="adm-modal adm-modal--form pm-make-live-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3 className="adm-modal-title">Make live</h3>
              <button
                type="button"
                className="adm-modal-close"
                onClick={() => setMakeLiveItem(null)}
                disabled={makeLiveSaving}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="adm-modal-note">
              <strong>{productListTitle(makeLiveItem, 'archived')}</strong>
              {' '}
              — choose the category before moving to the live catalogue.
            </p>
            <div className="adm-modal-body pm-make-live-fields">
              <label className="adm-field">
                <span className="adm-field-label">Main category</span>
                <select
                  value={makeLiveCategory.categoryId}
                  onChange={(e) => {
                    const categoryId = e.target.value;
                    const firstChild = subcategoryOptionsFromTree(tree, categoryId)[0]?.id || '';
                    setMakeLiveCategory({
                      categoryId,
                      childOneId: firstChild,
                      childTwoId: '',
                      childThreeId: '',
                      childFourId: '',
                    });
                  }}
                  className="adm-field-input"
                  disabled={makeLiveSaving}
                >
                  {tree.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              {withCurrentOption(
                subcategoryOptionsFromTree(tree, makeLiveCategory.categoryId),
                makeLiveCategory.childOneId,
              ).length > 0 && (
                <label className="adm-field">
                  <span className="adm-field-label">Child category 1</span>
                  <select
                    value={makeLiveCategory.childOneId}
                    onChange={(e) => setMakeLiveCategory((prev) => ({
                      ...prev,
                      childOneId: e.target.value,
                      childTwoId: '',
                      childThreeId: '',
                      childFourId: '',
                    }))}
                    className="adm-field-input"
                    disabled={makeLiveSaving}
                  >
                    <option value="">— None —</option>
                    {withCurrentOption(
                      subcategoryOptionsFromTree(tree, makeLiveCategory.categoryId),
                      makeLiveCategory.childOneId,
                    ).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="adm-modal-footer adm-modal-footer--end">
              <div className="adm-modal-footer__actions">
                <button type="button" className="adm-btn-ghost" onClick={() => setMakeLiveItem(null)} disabled={makeLiveSaving}>
                  Cancel
                </button>
                <button type="button" className="adm-btn-red" onClick={() => void confirmMakeLive()} disabled={makeLiveSaving}>
                  {makeLiveSaving ? <><Loader2 size={14} className="spin" /> Making live…</> : 'Make live'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
