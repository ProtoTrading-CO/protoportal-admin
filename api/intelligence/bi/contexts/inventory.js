import { executeQuery } from '../../query-engine/execute.js';
import { contextEnvelope, firstImage, mergeContextMeta } from './_helpers.js';

const SEVERITY = {
  negative: 'critical',
  low: 'high',
  zero: 'medium',
  high: 'low',
};

const REASONS = {
  negative: 'May be temporary during GRV processing — investigate only if it persists',
  low: 'Stock at or below reorder threshold',
  zero: 'Live on website with zero stock',
  high: 'Excess stock — consider promotion or transfer',
};

const LIST_QUERIES = {
  negative: 'stock.negative_stock_list',
  low: 'stock.low_stock_list',
  zero: 'stock.zero_stock_list',
  high: 'stock.high_stock_list',
};

export async function buildInventoryContext(params = {}, ctx = {}) {
  const type = String(params.type || 'all').toLowerCase();
  const limit = Math.min(25, Math.max(5, Number(params.limit) || 15));
  const threshold = Math.min(50, Math.max(1, Number(params.threshold) || 10));

  const types = type === 'all' ? ['negative', 'low', 'zero', 'high'] : [type];
  const tasks = types.map((t) => [t, runListQuery(t, limit, threshold, ctx)]);
  const results = await Promise.all(tasks.map(([, p]) => p));
  const failed = results.find((r) => !r.ok);
  if (failed) return failed;

  const lists = { negative: [], low: [], zero: [], high: [] };
  const envelopes = [];

  for (let i = 0; i < types.length; i++) {
    const key = types[i];
    const res = results[i];
    envelopes.push(res);
    const raw = res.data?.products || [];
    lists[key] = await enrichItems(raw, key, ctx);
  }

  const meta = mergeContextMeta(envelopes);
  return contextEnvelope('inventory', {
    lists,
    notAvailable: ['supplier_for_all_skus', 'erp_movement_history'],
  }, meta, 'inventory.context');
}

async function runListQuery(type, limit, threshold, ctx) {
  const queryId = LIST_QUERIES[type];
  if (!queryId) throw new Error(`Unknown inventory type: ${type}`);
  const params = { limit };
  if (type === 'low') params.threshold = threshold;
  if (type === 'high') params.limit = Math.min(limit, 20);
  return executeQuery(queryId, params, ctx);
}

async function enrichItems(products, listType, ctx) {
  const top = products.slice(0, 10);
  const supplierBySku = new Map();

  await Promise.all(top.map(async (p) => {
    const code = String(p.sku || '').trim().toUpperCase();
    if (!code) return;
    const res = await executeQuery('stock.stmast_cache_by_code', { code }, ctx);
    if (res.ok && res.data?.row?.supplier) {
      supplierBySku.set(code, res.data.row.supplier);
    }
  }));

  return products.map((p) => ({
    sku: p.sku,
    code: p.sku,
    title: p.title || p.sku,
    description: p.title || p.sku,
    stockQty: p.stockOnHand,
    category: p.category,
    supplier: supplierBySku.get(String(p.sku || '').toUpperCase()) || null,
    imageUrl: p.imageUrl || null,
    websiteStatus: 'live',
    severity: SEVERITY[listType] || 'medium',
    reason: REASONS[listType] || 'Listed for attention',
    price: p.price ?? null,
  }));
}
