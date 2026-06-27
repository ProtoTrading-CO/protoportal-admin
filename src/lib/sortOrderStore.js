import { applySkuOrder, lookupSortOrder, sortOrderLookupKeys, LEGACY_NAV_ALIASES } from './taxonomy';

let _store = null;
let _fetchPromise = null;
let _fetchedAt = 0;
const CACHE_MS = 60_000;

/** In-memory cache of sort-orders/orders.json (shared with trade portal). */
export async function fetchSortOrderStore({ force = false } = {}) {
  if (!force && _store && Date.now() - _fetchedAt < CACHE_MS) {
    return _store;
  }
  if (!force && _fetchPromise) return _fetchPromise;

  _fetchPromise = fetch('/api/category-sort-order', { credentials: 'same-origin' })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load sort order');
      _store = data;
      _fetchedAt = Date.now();
      return _store;
    })
    .catch((err) => {
      _fetchPromise = null;
      if (err?.message?.includes('fetch')) {
        throw new Error('Failed to fetch sort order — try Refresh');
      }
      throw err;
    })
    .finally(() => {
      _fetchPromise = null;
    });

  return _fetchPromise;
}

export function invalidateSortOrderStore() {
  _store = null;
  _fetchedAt = 0;
  _fetchPromise = null;
}

function mainBucketId(product) {
  const mainId = product.categoryPath?.[0] || product.category || '__uncategorized__';
  return LEGACY_NAV_ALIASES[mainId] || mainId;
}

/**
 * Apply saved website sort order to a product list.
 * At root (no nav path), sorts within each main category independently.
 */
export function applySortOrdersToProducts(products, navPath, tree, store) {
  const orders = store?.orders || {};
  if (!products?.length) return products;

  if (Array.isArray(navPath) && navPath.length) {
    const skuOrder = lookupSortOrder(orders, navPath, tree);
    return skuOrder?.length ? applySkuOrder(products, skuOrder) : products;
  }

  const groups = new Map();
  for (const product of products) {
    const bucket = mainBucketId(product);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(product);
  }

  const sorted = [];
  for (const [mainId, prods] of groups) {
    if (mainId === '__uncategorized__') {
      sorted.push(...prods);
      continue;
    }
    const skuOrder = lookupSortOrder(orders, [mainId], tree);
    sorted.push(...(skuOrder?.length ? applySkuOrder(prods, skuOrder) : prods));
  }
  return sorted;
}

export function sortMetaForPath(store, navPath, tree) {
  const keys = sortOrderLookupKeys(navPath, tree);
  const matchedKey = keys.find((k) => store?.orders?.[k]?.skuOrder?.length);
  const key = matchedKey || keys[0];
  return { updatedAt: store?.orders?.[key]?.updatedAt || null, matchedKey: key };
}

export async function persistSortOrder({ categoryKey, skuOrder, legacyKeys = [] }) {
  const res = await fetch('/api/category-sort-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ categoryKey, skuOrder, legacyKeys }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || 'Save failed');
    err.status = res.status;
    throw err;
  }
  invalidateSortOrderStore();
  return json;
}
