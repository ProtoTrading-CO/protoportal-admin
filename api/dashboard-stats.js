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
  if (!(await requireAdminKey(req, res))) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const stockSb = getStockClient();
    const mainSb = getMainClient();

    const [
      liveProducts,
      archivedProducts,
      approvalPending,
      recycleBin,
      uncategorized,
      customersRes,
      ordersCount,
    ] = await Promise.all([
      countTable(stockSb, 'website_stock'),
      countTable(stockSb, 'archived_products', (q) =>
        q.not('archived_by', 'in', '("new-products","recycle-bin")')),
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
      approvalPending,
      recycleBin,
      uncategorized,
      customers: customersRes.count || 0,
      orders: ordersCount.count || 0,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('dashboard-stats:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Stats fetch failed' });
  }
}
