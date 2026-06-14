import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { getStockClient } from './_stock-client.js';
import { mergeStagedImagesOntoLive } from './_stage-dormant.js';

function getMainClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function countTable(sb, table, filter) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function countNewItems(sb) {
  const liveSkus = new Set();
  let from = 0;
  while (true) {
    const { data } = await sb.from('website_stock').select('sku').range(from, from + 999);
    for (const r of data || []) liveSkus.add(r.sku);
    if ((data || []).length < 1000) break;
    from += 1000;
  }
  const { data, error } = await sb
    .from('archived_products')
    .select('sku')
    .eq('archived_by', 'new-products');
  if (error) throw error;
  return (data || []).filter((r) => !liveSkus.has(r.sku)).length;
}

async function countApproval(sb) {
  const { data: staged, error } = await sb
    .from('archived_products')
    .select('*')
    .eq('archived_by', 'new-products');
  if (error) throw error;
  const skus = (staged || []).map((r) => r.sku).filter(Boolean);
  if (!skus.length) return 0;
  const { data: liveRows } = await sb.from('website_stock').select('*').in('sku', skus);
  const liveBySku = new Map((liveRows || []).map((r) => [r.sku, r]));
  let n = 0;
  for (const row of staged || []) {
    const live = liveBySku.get(row.sku);
    if (!live) continue;
    const { appliedSlots } = mergeStagedImagesOntoLive(row, live);
    if (appliedSlots.length) n += 1;
  }
  return n;
}

/** Store-wide dashboard counts — never affected by search/filter state. */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const stockSb = getStockClient();
    const mainSb = getMainClient();

    const [
      liveProducts,
      archivedProducts,
      newItems,
      approvalPending,
      recycleBin,
      uncategorized,
      customersRes,
      ordersCount,
    ] = await Promise.all([
      countTable(stockSb, 'website_stock'),
      countTable(stockSb, 'archived_products', (q) =>
        q.not('archived_by', 'in', '("new-products","recycle-bin")')),
      countNewItems(stockSb),
      countApproval(stockSb),
      countTable(stockSb, 'archived_products', (q) => q.eq('archived_by', 'recycle-bin')),
      countTable(stockSb, 'website_stock', (q) => q.or('category.is.null,category.eq.')),
      mainSb.from('customers').select('*', { count: 'exact', head: true }),
      mainSb.from('orders').select('*', { count: 'exact', head: true }),
    ]);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      liveProducts,
      archivedProducts,
      newItems,
      approvalPending,
      recycleBin,
      uncategorized,
      customers: customersRes.count || 0,
      orders: ordersCount || 0,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('dashboard-stats:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Stats fetch failed' });
  }
}
