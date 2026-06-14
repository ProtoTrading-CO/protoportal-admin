import { requireAdminKey } from './_admin-auth.js';
import { loadTaxonomy } from './_taxonomy-utils.js';
import { getStockClient, enrichRowsWithProductStock } from './_stock-client.js';

const PAGE_SIZE = 1000;

async function fetchAllRows(supabase, table, { filter = null, orderBy = null } = {}) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select('*');
    if (orderBy) q = q.order(orderBy, { ascending: true });
    q = q.range(from, from + PAGE_SIZE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

/** Attach live SOH from public.products (join: products.sku = row.barcode). */
async function enrichRowsWithProductStockLocal(supabase, rows) {
  return enrichRowsWithProductStock(supabase, rows);
}

/**
 * Server-side stock mutations + raw listings. Replaces direct browser access
 * to the stock Supabase project so its key never ships in the client bundle.
 */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body || {};
  const supabase = getStockClient();

  try {
    if (action === 'listLive') {
      const [rows, tree] = await Promise.all([
        fetchAllRows(supabase, 'website_stock', { orderBy: 'title' }),
        loadTaxonomy().catch(() => []),
      ]);
      return res.status(200).json({ rows, tree });
    }

    if (action === 'listArchived') {
      const { archivedBy = null, excludeArchivedBy = null } = req.body;
      const [rawRows, tree, liveRows] = await Promise.all([
        fetchAllRows(supabase, 'archived_products', {
          orderBy: 'archived_at',
          filter: archivedBy ? (q) => q.eq('archived_by', archivedBy) : null,
        }),
        loadTaxonomy().catch(() => []),
        archivedBy === 'new-products'
          ? fetchAllRows(supabase, 'website_stock', { orderBy: 'sku' }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const filtered = Array.isArray(excludeArchivedBy) && excludeArchivedBy.length
        ? rawRows.filter((r) => !excludeArchivedBy.includes(r.archived_by))
        : rawRows;
      const liveSkuSet = new Set((liveRows || []).map((r) => r.sku));
      const withLiveFlag = filtered.map((r) => (
        archivedBy === 'new-products' ? { ...r, still_live: liveSkuSet.has(r.sku) } : r
      ));
      const rows = await enrichRowsWithProductStockLocal(supabase, withLiveFlag);
      return res.status(200).json({ rows, tree });
    }

    if (action === 'create') {
      const { row } = req.body;
      if (!row?.sku || !row?.barcode || !row?.title || !row?.category) {
        return res.status(400).json({ error: 'sku, barcode, title and category are required' });
      }
      const ALLOWED = new Set([
        'sku', 'barcode', 'title', 'original_description', 'price', 'category',
        'subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four',
        'image_url_one', 'image_url_two', 'image_url_three', 'image_url_four',
      ]);
      const clean = Object.fromEntries(Object.entries(row).filter(([k]) => ALLOWED.has(k)));
      const { error } = await supabase.from('website_stock').insert(clean);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'archive') {
      const { sku, by = 'product-manager' } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase.rpc('archive_product', { p_sku: sku, p_by: String(by).slice(0, 60) });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'unarchive') {
      const { sku } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase.rpc('unarchive_product', { p_sku: sku });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'recycleFromArchive') {
      const { sku, archivedBy } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase
        .from('archived_products')
        .update({ archived_by: String(archivedBy || 'recycle-bin').slice(0, 60), archived_at: new Date().toISOString() })
        .eq('sku', sku);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'setKeepLive') {
      const { sku, keepLive } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });

      const { data: live } = await supabase.from('website_stock').select('sku, barcode').eq('sku', sku).maybeSingle();
      let barcode = live?.barcode;
      if (!live) {
        const { data: arch } = await supabase.from('archived_products').select('sku, barcode').eq('sku', sku).maybeSingle();
        if (!arch) return res.status(404).json({ error: 'Product not found' });
        barcode = arch.barcode;
        const { error: archErr } = await supabase
          .from('archived_products')
          .update({ keep_live_when_oos: !!keepLive })
          .eq('sku', sku);
        if (archErr) throw archErr;
        if (keepLive) {
          const { error: unErr } = await supabase.rpc('unarchive_product', { p_sku: sku });
          if (unErr) throw unErr;
          const { error: flagErr } = await supabase
            .from('website_stock')
            .update({ keep_live_when_oos: true })
            .eq('sku', sku);
          if (flagErr) throw flagErr;
        }
      } else {
        const { error: liveErr } = await supabase
          .from('website_stock')
          .update({ keep_live_when_oos: !!keepLive })
          .eq('sku', sku);
        if (liveErr) throw liveErr;
      }

      if (!keepLive && barcode) {
        const { error: visErr } = await supabase.rpc('apply_catalog_visibility_for_barcode', { p_barcode: barcode });
        if (visErr) throw visErr;
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'deleteStagedPreview') {
      const { sku } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase
        .from('archived_products')
        .delete()
        .eq('sku', sku)
        .eq('archived_by', 'new-products');
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('stock-actions error:', err.message);
    return res.status(500).json({ error: err.message || 'Stock action failed' });
  }
}
