import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;
const CACHE_MS = 90_000;

let cache = { at: 0, data: null, loading: null };

function getMainClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function getStockClient() {
  const url = process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function readStock(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

async function fetchAllPages(client, table, select, orderBy = 'title') {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function enrichStockLevels(stock, rows) {
  const barcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];
  const stockByBarcode = new Map();
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await stock
      .from('products')
      .select('sku, stock_qty, available_stock')
      .in('sku', chunk);
    if (error) {
      console.error('apollo stock enrich chunk:', error.message);
      continue;
    }
    for (const p of data || []) stockByBarcode.set(p.sku, p);
  }
  return rows.map((row) => {
    const p = stockByBarcode.get(row.barcode);
    const available = readStock(p?.available_stock);
    const raw = readStock(p?.stock_qty);
    const soh = available !== null ? available : raw;
    return {
      sku: row.sku,
      title: row.title || row.sku,
      category: row.category || 'Uncategorised',
      barcode: row.barcode,
      price: row.price,
      stockOnHand: soh,
      tokens: tokenize(`${row.sku} ${row.title} ${row.category} ${row.barcode}`),
    };
  });
}

async function loadProducts(stock) {
  const websiteRows = await fetchAllPages(
    stock,
    'website_stock',
    'sku, title, category, barcode, price',
  );
  const all = await enrichStockLevels(stock, websiteRows);

  let archivedCount = 0;
  try {
    const { count } = await stock.from('archived_products').select('sku', { count: 'exact', head: true });
    archivedCount = count || 0;
  } catch {
    archivedCount = null;
  }

  const withStock = all.filter((p) => p.stockOnHand !== null);
  const byCategory = {};
  for (const p of all) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }

  return {
    liveCount: all.length,
    archivedCount,
    zeroStockCount: withStock.filter((p) => p.stockOnHand === 0).length,
    all,
    lowestStock: [...withStock].sort((a, b) => a.stockOnHand - b.stockOnHand).slice(0, 25),
    highestStock: [...withStock].sort((a, b) => b.stockOnHand - a.stockOnHand).slice(0, 10),
    byCategory: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count })),
  };
}

async function loadCustomers(supabase) {
  const { data, error, count } = await supabase
    .from('customers')
    .select('id, name, email, phone, business_name, business_type, city, province, tier, is_approved, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const ids = (data || []).map((c) => c.id).filter(Boolean);
  const orderCounts = {};
  if (ids.length) {
    const { data: orderRows } = await supabase.from('orders').select('customer_id').in('customer_id', ids);
    for (const row of orderRows || []) {
      if (row.customer_id) orderCounts[row.customer_id] = (orderCounts[row.customer_id] || 0) + 1;
    }
  }

  const list = (data || []).map((c) => ({
    id: c.id,
    name: c.name || c.business_name || '—',
    email: c.email,
    phone: c.phone,
    business: c.business_name,
    businessType: c.business_type,
    city: c.city,
    province: c.province,
    tier: c.tier,
    approved: c.is_approved,
    joined: c.created_at,
    orderCount: orderCounts[c.id] || 0,
    tokens: tokenize(`${c.name} ${c.email} ${c.business_name} ${c.business_type} ${c.city}`),
  }));

  return {
    total: count || list.length,
    pending: list.filter((c) => !c.approved).length,
    approved: list.filter((c) => c.approved).length,
    list,
  };
}

function extractOrderItems(order) {
  const raw = order.final_items || order.items || order.original_items || [];
  return Array.isArray(raw) ? raw : [];
}

async function loadOrders(supabase) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const start = thirtyDaysAgo.toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_ex_vat, created_at, original_items, final_items, items, customers(name, email, business_name)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const all = data || [];
  const recent30 = all.filter((o) => o.created_at >= start);
  const statusCounts = {};
  for (const o of recent30) {
    const s = o.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  const lineCounts = new Map();
  for (const order of all) {
    for (const item of extractOrderItems(order)) {
      const code = item.code || item.productId || item.sku || 'unknown';
      const name = item.name || code;
      const prev = lineCounts.get(code) || { code, name, totalQty: 0, orderCount: 0, tokens: tokenize(`${code} ${name}`) };
      prev.totalQty += Number(item.qty) || 0;
      prev.orderCount += 1;
      lineCounts.set(code, prev);
    }
  }

  const topLineItems = [...lineCounts.values()].sort((a, b) => b.totalQty - a.totalQty);

  return {
    total: all.length,
    last30Count: recent30.length,
    statusBreakdown: statusCounts,
    recent: all.slice(0, 20).map((o) => ({
      id: o.id?.slice(0, 8),
      status: o.status,
      totalExVat: o.total_ex_vat,
      createdAt: o.created_at,
      customer: o.customers?.business_name || o.customers?.name || o.customers?.email || 'Unknown',
    })),
    topLineItems,
  };
}

async function loadSearchAnalytics(supabase) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const start = thirtyDaysAgo.toISOString();

  const [top, zero, toOrders] = await Promise.all([
    supabase.rpc('rpc_top_searches', { p_start: start, p_limit: 15 }),
    supabase.rpc('rpc_zero_result_terms', { p_start: start, p_limit: 15 }),
    supabase.rpc('rpc_searches_to_orders', { p_start: start, p_limit: 15 }),
  ]);

  return {
    topSearches: top.data || [],
    zeroResultTerms: zero.data || [],
    searchesToOrders: toOrders.data || [],
  };
}

export function buildSearchIndex(data) {
  const entries = [];

  for (const p of data.products.all) {
    entries.push({ domain: 'product', id: p.sku, text: p.tokens.join(' '), payload: p });
  }
  for (const c of data.customers.list) {
    entries.push({ domain: 'customer', id: c.email, text: c.tokens.join(' '), payload: c });
  }
  for (const item of data.orders.topLineItems) {
    entries.push({ domain: 'order_item', id: item.code, text: item.tokens.join(' '), payload: item });
  }
  for (const row of data.search.topSearches) {
    const term = row.normalized_search_term || '';
    entries.push({ domain: 'search', id: term, text: tokenize(term).join(' '), payload: row });
  }

  return entries;
}

export function searchIndex(index, query, { domain = null, limit = 10 } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const scored = [];
  for (const entry of index) {
    if (domain && entry.domain !== domain) continue;
    let score = 0;
    for (const t of tokens) {
      if (entry.text.includes(t)) score += t.length;
      if (entry.id?.toLowerCase().includes(t)) score += t.length * 2;
    }
    if (score > 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.entry);
}

async function loadFreshData() {
  const supabase = getMainClient();
  const stock = getStockClient();

  const [customers, orders, search] = await Promise.all([
    loadCustomers(supabase),
    loadOrders(supabase),
    loadSearchAnalytics(supabase),
  ]);

  let products = {
    liveCount: 0,
    archivedCount: null,
    zeroStockCount: 0,
    all: [],
    lowestStock: [],
    highestStock: [],
    byCategory: [],
    error: stock ? null : 'Stock database not configured',
  };

  if (stock) {
    try {
      products = await loadProducts(stock);
    } catch (err) {
      console.error('apollo loadProducts:', err?.message || err);
      products.error = err?.message || 'Product load failed';
      try {
        const rows = await fetchAllPages(stock, 'website_stock', 'sku, title, category, barcode, price');
        products.liveCount = rows.length;
        products.all = rows.map((row) => ({
          sku: row.sku,
          title: row.title || row.sku,
          category: row.category || 'Uncategorised',
          barcode: row.barcode,
          price: row.price,
          stockOnHand: null,
          tokens: tokenize(`${row.sku} ${row.title} ${row.category}`),
        }));
      } catch {
        /* keep error state */
      }
    }
  }

  const data = { generatedAt: new Date().toISOString(), customers, orders, search, products };
  data.index = buildSearchIndex(data);
  return data;
}

export async function getApolloData(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) return cache.data;
  if (cache.loading) return cache.loading;

  cache.loading = loadFreshData()
    .then((data) => {
      cache.data = data;
      cache.at = Date.now();
      cache.loading = null;
      return data;
    })
    .catch((err) => {
      cache.loading = null;
      throw err;
    });

  return cache.loading;
}
