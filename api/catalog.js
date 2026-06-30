import { requireAdminKey } from './_admin-auth.js';
import { loadTaxonomy } from './_taxonomy-utils.js';
import { mergeStagedImagesOntoLive, batchValidateStockReady } from './_stage-dormant.js';
import { getStockClient, enrichRowsWithProductStock } from './_stock-client.js';
import {
  adaptCatalogRow,
  applySearchFilter,
  filterByCategoryPath,
  paginateRows,
  resolveCategoryFilters,
  applyCategoryFiltersToQuery,
  isExactlyZeroStock,
  isNegativeStock,
} from './_catalog-adapt.js';
import { isMotarroBrowsePath, isMotarroProduct } from './_mottaro-category.js';

const VALID_STATUS = new Set(['live', 'archived', 'new-items', 'approval', 'recycle']);
const EXCLUDE_ARCHIVED = ['new-products', 'recycle-bin'];
const PAGE_CHUNK = 1000;

async function fetchAllMotarroRows(sb, { search, categoryPath, tree, sort }) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = sb.from('website_stock').select('*');
    const term = safeSearchTerm(search);
    if (term) {
      q = q.or(`title.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
    } else {
      q = q.or('title.ilike.%motarro%,title.ilike.%mottaro%,title.ilike.%monttaro%');
    }
    if (sort === 'updated') q = q.order('updated_at', { ascending: false });
    else q = q.order('title', { ascending: true });
    q = q.range(from, from + PAGE_CHUNK - 1);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data || []).filter(isMotarroProduct);
    rows.push(...batch);
    if ((data || []).length < PAGE_CHUNK) break;
    from += PAGE_CHUNK;
  }
  return filterByCategoryPath(rows, categoryPath, tree);
}

async function fetchAllLiveRows(sb, { search, categoryPath, tree, sort }) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = sb.from('website_stock').select('*');
    const term = safeSearchTerm(search);
    if (term) {
      q = q.or(`title.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
    }
    q = applyCategoryFiltersToQuery(q, resolveCategoryFilters(tree, categoryPath));
    if (sort === 'updated') q = q.order('updated_at', { ascending: false });
    else q = q.order('title', { ascending: true });
    q = q.range(from, from + PAGE_CHUNK - 1);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_CHUNK) break;
    from += PAGE_CHUNK;
  }
  return rows;
}

async function fetchAllArchivedRows(sb, { archivedBy, excludeBy, sort }) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = sb.from('archived_products').select('*');
    if (archivedBy) q = q.eq('archived_by', archivedBy);
    if (excludeBy?.length) {
      const quoted = excludeBy.map((v) => `"${v}"`).join(',');
      q = q.or(`archived_by.is.null,archived_by.not.in.(${quoted})`);
    }
    if (sort === 'updated') q = q.order('updated_at', { ascending: false });
    else q = q.order('title', { ascending: true });
    q = q.range(from, from + PAGE_CHUNK - 1);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_CHUNK) break;
    from += PAGE_CHUNK;
  }
  return rows;
}

function parseCategoryPath(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw).split('/').filter(Boolean);
  }
}

function safeSearchTerm(search) {
  return String(search || '').replace(/[%',()\\]/g, ' ').trim();
}

function applyCatalogSearchFilter(q, term) {
  if (!term) return q;
  return q.or([
    `title.ilike.%${term}%`,
    `sku.ilike.%${term}%`,
    `barcode.ilike.%${term}%`,
    `category.ilike.%${term}%`,
    `subcategory_one.ilike.%${term}%`,
    `subcategory_two.ilike.%${term}%`,
    `subcategory_three.ilike.%${term}%`,
    `subcategory_four.ilike.%${term}%`,
  ].join(','));
}

async function queryLivePaginated(sb, { search, categoryPath, tree, page, pageSize, sort }) {
  if (isMotarroBrowsePath(categoryPath)) {
    let rows = await fetchAllMotarroRows(sb, { search, categoryPath, tree, sort });
    rows = applySearchFilter(rows, search);
    const pageSlice = paginateRows(rows, page, pageSize);
    return { ...pageSlice, archived: false };
  }
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = sb.from('website_stock').select('*', { count: 'exact' });
  const term = safeSearchTerm(search);
  if (term) {
    q = applyCatalogSearchFilter(q, term);
  }
  q = applyCategoryFiltersToQuery(q, resolveCategoryFilters(tree, categoryPath));
  if (sort === 'updated') q = q.order('updated_at', { ascending: false });
  else q = q.order('title', { ascending: true });
  q = q.range(from, to);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0, page, pageSize, hasMore: (count || 0) > to + 1, archived: false };
}

async function queryArchivedPaginated(sb, { search, categoryPath, tree, page, pageSize, sort, archivedBy, excludeBy }) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = sb.from('archived_products').select('*', { count: 'exact' });
  if (archivedBy) q = q.eq('archived_by', archivedBy);
  const term = safeSearchTerm(search);
  if (term) {
    q = applyCatalogSearchFilter(q, term);
  }
  q = applyCategoryFiltersToQuery(q, resolveCategoryFilters(tree, categoryPath));
  if (excludeBy?.length) {
    const quoted = excludeBy.map((v) => `"${v}"`).join(',');
    q = q.or(`archived_by.is.null,archived_by.not.in.(${quoted})`);
  }
  if (sort === 'updated') q = q.order('updated_at', { ascending: false });
  else q = q.order('title', { ascending: true });
  q = q.range(from, to);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0, page, pageSize, hasMore: (count || 0) > to + 1, archived: true };
}

async function fetchLiveSkus(sb) {
  const skus = new Set();
  let from = 0;
  while (true) {
    const { data } = await sb.from('website_stock').select('sku').range(from, from + 999);
    for (const r of data || []) skus.add(r.sku);
    if ((data || []).length < 1000) break;
    from += 1000;
  }
  return skus;
}

async function loadApprovalRows(sb) {
  const staged = await fetchAllArchivedRows(sb, { archivedBy: 'new-products', sort: 'updated' });
  const skus = staged.map((r) => r.sku).filter(Boolean);
  if (!skus.length) return [];
  const { data: liveRows } = await sb.from('website_stock').select('*').in('sku', skus);
  const liveBySku = new Map((liveRows || []).map((r) => [r.sku, r]));
  const barcodes = (staged || []).map((r) => r.barcode || r.sku).filter(Boolean);
  const stockChecks = await batchValidateStockReady(sb, barcodes);
  const rows = [];
  for (const row of staged) {
    const live = liveBySku.get(row.sku);
    if (!live) continue;
    const { appliedSlots } = mergeStagedImagesOntoLive(row, live);
    if (!appliedSlots.length) continue;
    const stockCheck = stockChecks.get(String(row.barcode || row.sku || '').trim()) || { ok: false, error: 'Missing barcode' };
    rows.push({
      ...row,
      _live: live,
      _changedSlots: appliedSlots,
      _stockReady: stockCheck.ok,
      _stockError: stockCheck.ok ? null : stockCheck.error,
    });
  }
  return rows;
}

/** Paginated catalogue read for unified Product Manager. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  if (req.method !== 'GET') return res.status(405).end();

  const status = String(req.query.status || 'live').trim();
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...VALID_STATUS].join(', ')}` });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const search = String(req.query.search || '').trim();
  const categoryPath = parseCategoryPath(req.query.categoryPath);
  const sort = String(req.query.sort || 'title').trim();

  try {
    const sb = getStockClient();
    const tree = await loadTaxonomy().catch(() => []);

    let result;
    let stockAlreadyEnriched = false;
    if (status === 'live') {
      result = await queryLivePaginated(sb, { search, categoryPath, tree, page, pageSize, sort });
    } else if (status === 'recycle') {
      result = await queryArchivedPaginated(sb, {
        search, categoryPath, tree, page, pageSize, sort, archivedBy: 'recycle-bin',
      });
    } else if (status === 'archived') {
      const stockFilter = String(req.query.stockFilter || 'archived').trim();
      if (stockFilter === 'negative') {
        // Live products with negative ERP stock only — zeros excluded.
        let rows = await fetchAllLiveRows(sb, { search, categoryPath, tree, sort });
        rows = await enrichRowsWithProductStock(sb, rows);
        rows = rows.filter(isNegativeStock);
        const pageSlice = paginateRows(rows, page, pageSize);
        result = { ...pageSlice, archived: false, archiveView: 'negative-live' };
        stockAlreadyEnriched = true;
      } else {
        let rows = await fetchAllArchivedRows(sb, { search, categoryPath, tree, sort, excludeBy: EXCLUDE_ARCHIVED });
        rows = await enrichRowsWithProductStock(sb, rows);
        rows = rows.filter((r) => !isExactlyZeroStock(r));
        const pageSlice = paginateRows(rows, page, pageSize);
        result = { ...pageSlice, archived: true, archiveView: 'archived' };
        stockAlreadyEnriched = true;
      }
    } else if (status === 'new-items') {
      const liveSkus = await fetchLiveSkus(sb);
      const allRows = await fetchAllArchivedRows(sb, { archivedBy: 'new-products', sort });
      let rows = allRows.filter((r) => !liveSkus.has(r.sku));
      rows = filterByCategoryPath(rows, categoryPath, tree);
      rows = applySearchFilter(rows, search);
      const pageSlice = paginateRows(rows, page, pageSize);
      result = { ...pageSlice, archived: true };
    } else if (status === 'approval') {
      let rows = await loadApprovalRows(sb);
      rows = filterByCategoryPath(rows, categoryPath, tree);
      rows = applySearchFilter(rows, search);
      const pageSlice = paginateRows(rows, page, pageSize);
      result = { ...pageSlice, archived: true };
    }

    const needsStock = status === 'live' || status === 'archived' || status === 'recycle'
      || status === 'new-items' || status === 'approval';
    let enriched = result.rows;
    if (needsStock && enriched.length && !stockAlreadyEnriched) {
      enriched = await enrichRowsWithProductStock(sb, enriched, { includePrice: status === 'new-items' });
    }

    const adapted = enriched.map((r) => adaptCatalogRow(r, tree, { archived: result.archived }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      rows: adapted,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
      status,
      archiveView: result.archiveView || (status === 'archived' ? 'archived' : null),
    });
  } catch (err) {
    console.error('catalog:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Catalog fetch failed' });
  }
}
