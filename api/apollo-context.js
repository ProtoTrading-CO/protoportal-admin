import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;
const MAX_CUSTOMERS = 500;
const MAX_ORDERS = 200;
const LOW_STOCK_TOP = 25;

function getMainClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getStockClient() {
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

async function fetchAllPages(queryFn) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function loadCustomers(supabase) {
  const { data, error, count } = await supabase
    .from('customers')
    .select('id, name, email, phone, business_name, business_type, city, province, country, tier, is_approved, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(MAX_CUSTOMERS);

  if (error) throw error;

  const ids = (data || []).map((c) => c.id).filter(Boolean);
  const orderCounts = {};
  if (ids.length) {
    const { data: orderRows } = await supabase
      .from('orders')
      .select('customer_id')
      .in('customer_id', ids);
    for (const row of orderRows || []) {
      if (!row.customer_id) continue;
      orderCounts[row.customer_id] = (orderCounts[row.customer_id] || 0) + 1;
    }
  }

  return {
    total: count || (data || []).length,
    truncated: (count || 0) > MAX_CUSTOMERS,
    list: (data || []).map((c) => ({
      name: c.name || c.business_name || '—',
      email: c.email,
      phone: c.phone,
      business: c.business_name,
      businessType: c.business_type,
      city: c.city,
      province: c.province,
      country: c.country,
      tier: c.tier,
      approved: c.is_approved,
      joined: c.created_at,
      orderCount: orderCounts[c.id] || 0,
    })),
  };
}

async function loadOrders(supabase, start) {
  const { data, error, count } = await supabase
    .from('orders')
    .select('id, status, total_ex_vat, created_at, customer_id, customers(name, email, business_name)', { count: 'exact' })
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS);

  if (error) throw error;

  const statusCounts = {};
  for (const row of data || []) {
    const s = row.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return {
    totalInPeriod: count || (data || []).length,
    truncated: (count || 0) > MAX_ORDERS,
    statusBreakdown: statusCounts,
    recent: (data || []).map((o) => ({
      id: o.id?.slice(0, 8),
      status: o.status,
      totalExVat: o.total_ex_vat,
      createdAt: o.created_at,
      customer: o.customers?.business_name || o.customers?.name || o.customers?.email || 'Unknown',
    })),
  };
}

async function loadAllOrdersSummary(supabase) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_ex_vat, created_at, customers(name, email, business_name)')
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS);

  if (error) throw error;

  return (data || []).map((o) => ({
    id: o.id?.slice(0, 8),
    status: o.status,
    totalExVat: o.total_ex_vat,
    createdAt: o.created_at,
    customer: o.customers?.business_name || o.customers?.name || o.customers?.email || 'Unknown',
  }));
}

async function loadProductCatalogue(stock) {
  const websiteRows = await fetchAllPages((from, to) =>
    stock.from('website_stock')
      .select('sku, title, category, barcode, price, is_archived')
      .order('title', { ascending: true })
      .range(from, to),
  );

  const liveRows = websiteRows.filter((r) => !r.is_archived);
  const barcodes = [...new Set(liveRows.map((r) => r.barcode).filter(Boolean))];
  const stockByBarcode = new Map();

  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await stock
      .from('products')
      .select('sku, stock_qty, available_stock')
      .in('sku', chunk);
    if (error) throw error;
    for (const p of data || []) stockByBarcode.set(p.sku, p);
  }

  const enriched = liveRows.map((row) => {
    const p = stockByBarcode.get(row.barcode);
    const available = readStock(p?.available_stock);
    const raw = readStock(p?.stock_qty);
    const soh = available !== null ? available : raw;
    return {
      sku: row.sku,
      title: row.title,
      category: row.category || 'Uncategorised',
      price: row.price,
      stockOnHand: soh,
    };
  });

  const withStock = enriched.filter((r) => r.stockOnHand !== null);
  const sortedLow = [...withStock].sort((a, b) => a.stockOnHand - b.stockOnHand);
  const sortedHigh = [...withStock].sort((a, b) => b.stockOnHand - a.stockOnHand);

  const categoryCounts = {};
  for (const row of enriched) {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
  }

  const { count: archivedCount } = await stock
    .from('archived_products')
    .select('sku', { count: 'exact', head: true });

  return {
    liveCount: liveRows.length,
    archivedCount: archivedCount ?? null,
    withStockData: withStock.length,
    zeroStockCount: withStock.filter((r) => r.stockOnHand === 0).length,
    lowestStock: sortedLow.slice(0, LOW_STOCK_TOP).map((r) => ({
      sku: r.sku,
      title: r.title,
      category: r.category,
      stockOnHand: r.stockOnHand,
      price: r.price,
    })),
    highestStock: sortedHigh.slice(0, 10).map((r) => ({
      sku: r.sku,
      title: r.title,
      stockOnHand: r.stockOnHand,
    })),
    productsByCategory: Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([category, count]) => ({ category, count })),
  };
}

export async function buildApolloContext() {
  const supabase = getMainClient();
  const stock = getStockClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const start = thirtyDaysAgo.toISOString();

  const [
    customers,
    orders30d,
    allOrders,
    topSearchesRes,
    zeroResultsRes,
    searchesToOrdersRes,
  ] = await Promise.all([
    loadCustomers(supabase),
    loadOrders(supabase, start),
    loadAllOrdersSummary(supabase),
    supabase.rpc('rpc_top_searches', { p_start: start, p_limit: 10 }),
    supabase.rpc('rpc_zero_result_terms', { p_start: start, p_limit: 10 }),
    supabase.rpc('rpc_searches_to_orders', { p_start: start, p_limit: 10 }),
  ]);

  let products = null;
  if (stock) {
    try {
      products = await loadProductCatalogue(stock);
    } catch (err) {
      console.error('apollo product catalogue:', err?.message || err);
      products = { error: 'Could not load product stock data' };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    accessNote: 'Full read-only admin snapshot — customers, orders, products/stock, and search analytics.',
    customers,
    orders: {
      last30Days: orders30d,
      allRecent: allOrders,
    },
    products,
    searchAnalytics: {
      topSearches: topSearchesRes.data || [],
      zeroResultTerms: zeroResultsRes.data || [],
      searchesToOrders: searchesToOrdersRes.data || [],
    },
  };
}
