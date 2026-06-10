import { supabaseStock } from './supabaseStock';
import { fuzzyFilter } from './fuzzySearch';
import { buildCategoryPath, labelToSlug, slugToLabel } from './taxonomy';

let _loadPromise = null;
let _cache = null;
let _adminLoadPromise = null;
let _adminCache = null;

const LS_KEY = 'proto_catalog_v7';
const LS_TTL = 15 * 60 * 1000;

function saveToLocalCache(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function loadFromLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return (Date.now() - ts < LS_TTL) ? data : null;
  } catch { return null; }
}

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const PAGE_SIZE = 1000;

async function fetchAllRows(table, selectCols = '*', extraFilter = null, orderBy = null) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabaseStock.from(table).select(selectCols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    q = q.range(from, from + PAGE_SIZE - 1);
    if (extraFilter) q = extraFilter(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function adapt(row, { archived = false } = {}) {
  const images = [row.image_url_one, row.image_url_two].filter(Boolean);
  const subLabels = [row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four].filter(Boolean);
  return {
    id: row.sku,
    code: row.barcode,
    barcode: row.barcode,
    websiteSku: row.sku,
    sku: row.sku,
    parentSku: null,
    name: row.title,
    title: row.title,
    description: row.original_description || '',
    originalDescription: row.original_description || '',
    price: 0,
    images,
    image: images[0] || '',
    secondaryImage: images[1] || '',
    stockQty: 0,
    stockOnHand: 0,
    colour: '',
    category: labelToSlug(row.category),
    categoryLabel: row.category,
    categoryPath: buildCategoryPath(row.category, subLabels),
    subcategoryLabels: subLabels,
    tags: [],
    badges: [],
    isNew: false,
    isSpecial: false,
    isArchived: archived,
    sortOrder: 0,
    minQty: 1,
    casePack: '',
    marginCue: '',
    leadTime: '',
    tradeNote: '',
    inStock: true,
    createdAt: row.created_at,
    yearlySales: 0,
    supplier: '',
  };
}

async function loadLiveFromDB({ onProgress } = {}) {
  onProgress?.(10);
  const rows = await fetchAllRows('website_stock', '*', null, 'title');
  onProgress?.(100);
  return rows.map((r) => adapt(r));
}

async function loadArchivedFromDB() {
  const rows = await fetchAllRows('archived_products', '*', null, 'archived_at');
  return rows.map((r) => adapt(r, { archived: true }));
}

function getAllCachedAdmin(onProgress) {
  if (_adminCache) {
    onProgress?.(100);
    return Promise.resolve(_adminCache);
  }
  if (!_adminLoadPromise) {
    _adminLoadPromise = loadLiveFromDB({ onProgress })
      .then((all) => { _adminCache = all; return _adminCache; })
      .catch((err) => { _adminLoadPromise = null; throw err; });
  }
  return _adminLoadPromise;
}

function getAllCached() {
  if (!_loadPromise) {
    const local = loadFromLocalCache();
    if (local) {
      _cache = local;
      _loadPromise = Promise.resolve(local);
    } else {
      _loadPromise = fetchJsonWithTimeout('/api/products', 8000)
        .then((products) => {
          _cache = products;
          saveToLocalCache(products);
          return _cache;
        })
        .catch(() => loadLiveFromDB()
          .then((all) => {
            _cache = all.filter((p) => p.category);
            saveToLocalCache(_cache);
            return _cache;
          }))
        .catch((err) => {
          _loadPromise = null;
          throw err;
        });
    }
  }
  return _loadPromise;
}

export function invalidateProductCache() {
  _cache = null;
  _loadPromise = null;
  _adminCache = null;
  _adminLoadPromise = null;
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export function invalidateAdminCache() {
  _adminCache = null;
  _adminLoadPromise = null;
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  return products.filter((p) => {
    const cp = p.categoryPath || [];
    const depth = Math.min(cp.length, categoryPath.length);
    return depth > 0 && categoryPath.slice(0, depth).every((seg, i) => cp[i] === seg);
  });
}

function applyCategoryFilter(rows, categoryFilter) {
  if (!categoryFilter || categoryFilter === 'all') return rows;
  return rows.filter((p) =>
    p.category === categoryFilter
    || p.categoryPath?.[1] === categoryFilter
    || p.categoryPath?.[2] === categoryFilter
    || p.categoryPath?.[3] === categoryFilter
    || p.categoryLabel === categoryFilter
  );
}

// ─── Public read API ──────────────────────────────────────────────────────────

export async function fetchDistinctCategories() {
  const all = await getAllCachedAdmin();
  return [...new Set(all.map((p) => p.categoryLabel).filter(Boolean))].sort();
}

export async function fetchProducts() {
  return getAllCached();
}

export async function fetchProductPage({
  page = 1,
  pageSize = 60,
  searchQuery = '',
  categoryPath = [],
  sort = 'featured',
} = {}) {
  let products = await getAllCached();
  const hasSearch = Boolean(searchQuery.trim());
  if (!hasSearch) products = applyPathFilter(products, categoryPath);
  products = hasSearch ? fuzzyFilter(products, searchQuery) : products;
  if (sort === 'latest') products = [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = products.length;
  const from = (page - 1) * pageSize;
  return { products: products.slice(from, from + pageSize), total, page, pageSize, hasMore: total > from + pageSize };
}

export async function fetchAllProductsAdmin({ onProgress } = {}) {
  return getAllCachedAdmin(onProgress);
}

export async function fetchAdminProductsPage({
  page = 1,
  pageSize = 50,
  searchQuery = '',
  archived = false,
  zeroStockOnly = false, // legacy alias — treated as archived
  categoryFilter = '',
  onProgress,
} = {}) {
  const showArchived = archived || zeroStockOnly;
  let rows = showArchived ? await loadArchivedFromDB() : await fetchAllProductsAdmin({ onProgress });
  rows = applyCategoryFilter(rows, categoryFilter);
  rows = searchQuery.trim() ? fuzzyFilter(rows, searchQuery) : rows;
  rows = [...rows].sort((a, b) => (a.categoryLabel || '').localeCompare(b.categoryLabel || '') || a.name.localeCompare(b.name));
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), total, page, pageSize };
}

export async function fetchProductsByMainCategory(mainCategory, { limit = 10000 } = {}) {
  const all = await getAllCachedAdmin();
  const filtered = mainCategory && mainCategory !== 'all'
    ? all.filter((p) => p.category === mainCategory)
    : all;
  return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

export async function fetchDormantProducts({ searchQuery = '' } = {}) {
  let dormant = await loadArchivedFromDB();
  dormant = searchQuery.trim() ? fuzzyFilter(dormant, searchQuery) : dormant;
  dormant.sort((a, b) => a.name.localeCompare(b.name));
  return dormant;
}

export async function exportProductsCsv() {
  return fetchAllProductsAdmin();
}

export async function checkStock() { return null; }

// ─── Image helpers ────────────────────────────────────────────────────────────

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 800;
      const scale = Math.min(1, SIZE / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const offsetX = Math.round((SIZE - w) / 2);
      const offsetY = Math.round((SIZE - h) / 2);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, offsetX, offsetY, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas compression failed')); return; }
        resolve(blob);
      }, 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export async function uploadDormantImageWithBase64(file) {
  const compressed = await compressImage(file);
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });

  const res = await fetch('/api/transform-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: 'image/jpeg', base64 }),
  });

  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) {
    if (res.status === 413) throw new Error('Image too large after compression — try a smaller file');
    throw new Error(json.error || `Image generation failed (${res.status})`);
  }
  return { url: json.url, base64 };
}

export async function uploadDormantImage(file) {
  const compressed = await compressImage(file);
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });

  const res = await fetch('/api/upload-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: 'image/jpeg', base64 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return json.url;
}

// ─── Admin writes ─────────────────────────────────────────────────────────────

function pathToWriteFields(categoryPath = []) {
  const category = slugToLabel(categoryPath[0]) || '';
  const subs = categoryPath.slice(1).map((slug) => slugToLabel(slug)).filter(Boolean);
  return {
    category,
    subcategory_one: subs[0] || category,
    subcategory_two: subs[1] || null,
    subcategory_three: subs[2] || null,
    subcategory_four: subs[3] || null,
  };
}

export async function createProduct(payload) {
  const sku = String(payload.code || payload.websiteSku || '').trim();
  const barcode = String(payload.code || sku).trim();
  const title = String(payload.name || '').trim();
  if (!sku || !barcode || !title) throw new Error('Barcode and product name are required');

  const { category, subcategory_one, subcategory_two, subcategory_three, subcategory_four } = pathToWriteFields(payload.categoryPath);
  if (!category) throw new Error('Category is required');

  const row = {
    sku,
    barcode,
    title,
    original_description: String(payload.description || title).trim(),
    image_url_one: payload.image?.trim() || null,
    image_url_two: payload.secondaryImage?.trim() || null,
    category,
    subcategory_one,
    subcategory_two,
    subcategory_three,
    subcategory_four,
  };

  const { error } = await supabaseStock.from('website_stock').insert(row);
  if (error) throw error;
  invalidateProductCache();
  invalidateAdminCache();
}

export async function updateProduct(sku, payload) {
  const contentFields = {};
  if (payload.image !== undefined || payload.secondaryImage !== undefined) {
    const images = [payload.image, payload.secondaryImage]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    contentFields.image = images.join(',');
  }
  if (payload.description !== undefined) contentFields.description = payload.description;

  if (Object.keys(contentFields).length) {
    const res = await fetch('/api/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteSku: sku, ...contentFields }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Update failed');
  }

  const patch = {};
  if (payload.name !== undefined) patch.title = payload.name;
  if (payload.categoryPath?.length) Object.assign(patch, pathToWriteFields(payload.categoryPath));
  if (!Object.keys(patch).length) {
    invalidateAdminCache();
    return;
  }

  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseStock.from('website_stock').update(patch).eq('sku', sku);
  if (error) throw error;
  invalidateProductCache();
  invalidateAdminCache();
}

export async function archiveProduct(sku, shouldArchive = true) {
  if (shouldArchive) {
    const { error } = await supabaseStock.rpc('archive_product', { p_sku: sku, p_by: null });
    if (error) throw error;
  } else {
    const { error } = await supabaseStock.rpc('unarchive_product', { p_sku: sku });
    if (error) throw error;
  }
  invalidateProductCache();
  invalidateAdminCache();
}

export async function deleteProduct(sku) {
  const res = await fetch('/api/delete-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteSku: sku }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Delete failed');
  invalidateAdminCache();
  invalidateProductCache();
}

export async function fetchReorderProducts({
  mainCategory,
  subcategoryId = null,
  status = 'active',
} = {}) {
  let products = [];
  if (status === 'archived') {
    products = await loadArchivedFromDB();
  } else if (status === 'all') {
    const [live, archived] = await Promise.all([getAllCachedAdmin(), loadArchivedFromDB()]);
    products = [...live, ...archived];
  } else {
    products = await getAllCachedAdmin();
  }

  if (mainCategory && mainCategory !== 'all') {
    products = products.filter((p) => p.category === mainCategory);
  }
  if (subcategoryId && subcategoryId !== 'all') {
    products = products.filter((p) =>
      p.categoryPath?.[1] === subcategoryId
      || p.categoryPath?.[2] === subcategoryId
      || p.categoryPath?.[3] === subcategoryId
    );
  }

  return products.sort((a, b) => a.name.localeCompare(b.name));
}

export async function bulkMoveProducts({ skus, categoryId, subcategoryId }) {
  const res = await fetch('/api/bulk-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'move', skus, categoryId, subcategoryId }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Bulk move failed');
  if (json.failed?.length) {
    throw new Error(`${json.failed.length} item(s) failed to move`);
  }
  invalidateProductCache();
  invalidateAdminCache();
  return json;
}

export async function bulkArchiveProducts(skus) {
  const res = await fetch('/api/bulk-products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'archive', skus }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Bulk archive failed');
  if (json.failed?.length) {
    throw new Error(`${json.failed.length} item(s) failed to archive`);
  }
  invalidateProductCache();
  invalidateAdminCache();
  return json;
}

export async function saveSortOrder() { /* website_stock has no sort_order column */ }
export async function setSpecial() { throw new Error('Not supported'); }
export async function updateSortOrder() { throw new Error('Not supported'); }
export async function bulkUpsertProducts() { throw new Error('Not supported'); }
