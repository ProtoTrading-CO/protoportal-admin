import { createClient } from '@supabase/supabase-js';
import { collectImageUrlsFromRow, removeStagingObjects, collectLiveReferencedStagingPaths, storagePathFromPublicUrl } from './_staging-storage.js';

function getClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Daily cron — remove expired Approval previews and staging/* storage objects. */
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const sb = getClient();
  const now = new Date().toISOString();

  const { data: expired, error } = await sb
    .from('archived_products')
    .select('*')
    .eq('archived_by', 'new-products')
    .not('staged_expires_at', 'is', null)
    .lte('staged_expires_at', now);

  if (error) {
    console.error('purge-expired-staging:', error.message);
    return res.status(500).json({ error: error.message });
  }

  let removedFiles = 0;
  let removedRows = 0;
  let skippedFiles = 0;

  const liveStagingRefs = await collectLiveReferencedStagingPaths(sb);

  for (const row of expired || []) {
    const urls = collectImageUrlsFromRow(row);
    const safeUrls = urls.filter((url) => {
      const path = storagePathFromPublicUrl(url);
      if (!path?.startsWith('staging/')) return false;
      if (liveStagingRefs.has(path)) {
        skippedFiles += 1;
        return false;
      }
      return true;
    });
    const { removed } = await removeStagingObjects(sb, safeUrls, { skipLiveReferenced: false });
    removedFiles += removed;
    const { error: delErr } = await sb
      .from('archived_products')
      .delete()
      .eq('sku', row.sku)
      .eq('archived_by', 'new-products');
    if (!delErr) removedRows += 1;
  }

  return res.status(200).json({
    ok: true,
    purgedRows: removedRows,
    purgedFiles: removedFiles,
    skippedLiveReferenced: skippedFiles,
    checkedAt: now,
  });
}
