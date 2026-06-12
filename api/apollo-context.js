import { createClient } from '@supabase/supabase-js';

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

export async function buildApolloContext() {
  const supabase = getMainClient();
  const stock = getStockClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const start = thirtyDaysAgo.toISOString();

  const [
    recentOrdersRes,
    pendingCustomersRes,
    approvedCustomersRes,
    topSearchesRes,
    zeroResultsRes,
    orderStatusRes,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_ex_vat, created_at, customers(name, email, business_name)')
      .gte('created_at', start)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_approved', false),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_approved', true),
    supabase.rpc('rpc_top_searches', { p_start: start, p_limit: 10 }),
    supabase.rpc('rpc_zero_result_terms', { p_start: start, p_limit: 10 }),
    supabase.from('orders').select('status').gte('created_at', start),
  ]);

  let productCount = null;
  let archivedCount = null;
  if (stock) {
    const [liveRes, archivedRes] = await Promise.all([
      stock.from('website_stock').select('sku', { count: 'exact', head: true }),
      stock.from('website_stock').select('sku', { count: 'exact', head: true }).eq('is_archived', true),
    ]);
    productCount = liveRes.count ?? null;
    archivedCount = archivedRes.count ?? null;
  }

  const statusCounts = {};
  for (const row of orderStatusRes.data || []) {
    const s = row.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    orders: {
      recent: (recentOrdersRes.data || []).map((o) => ({
        id: o.id?.slice(0, 8),
        status: o.status,
        totalExVat: o.total_ex_vat,
        createdAt: o.created_at,
        customer: o.customers?.business_name || o.customers?.name || o.customers?.email || 'Unknown',
      })),
      statusBreakdown: statusCounts,
    },
    customers: {
      pendingApproval: pendingCustomersRes.count || 0,
      approved: approvedCustomersRes.count || 0,
    },
    searchAnalytics: {
      topSearches: topSearchesRes.data || [],
      zeroResultTerms: zeroResultsRes.data || [],
    },
    products: {
      liveCount: productCount,
      archivedCount,
    },
  };
}
