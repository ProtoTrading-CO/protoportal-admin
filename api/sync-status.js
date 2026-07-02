import { requireAdminKey } from './_admin-auth.js';
import { getStockClient } from './_stock-client.js';

/** Last SOH + price sync timestamps for admin header badge. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const sb = getStockClient();

    const { data: metaRows, error: metaErr } = await sb
      .from('sync_metadata')
      .select('key, value')
      .in('key', ['website_stock_synced_at', 'website_price_synced_at']);
    if (metaErr && !/sync_metadata/i.test(metaErr.message || '')) {
      throw metaErr;
    }

    const meta = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));

    const { data: stmastRow } = await sb
      .from('stmast_cache')
      .select('imported_at')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stmastImportedAt = stmastRow?.imported_at || null;
    const stockSyncedAt = meta.website_stock_synced_at || stmastImportedAt || null;
    const priceSyncedAt = meta.website_price_synced_at || meta.website_stock_synced_at || null;

    return res.status(200).json({
      stockSyncedAt,
      priceSyncedAt,
      stmastImportedAt,
    });
  } catch (err) {
    console.error('sync-status:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Failed to load sync status' });
  }
}
