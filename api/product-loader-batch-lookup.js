import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { isSqlConfigured } from './_sql-provider.js';
import {
  classifyBatchItem,
  fetchDormantSkuSet,
  parseLoaderFilename,
  resolveProductLoaderMatch,
} from './_product-loader-lookup.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filenames } = req.body || {};
  if (!Array.isArray(filenames) || !filenames.length) {
    return res.status(400).json({ error: 'filenames array is required' });
  }

  const sb = getStockClient();
  const dormantSkus = await fetchDormantSkuSet(sb).catch(() => new Set());
  const items = [];
  let matched = 0;
  const groups = { ready: 0, needs_review: 0, not_found: 0 };

  for (const filename of filenames) {
    const parsed = parseLoaderFilename(filename);
    if (parsed.parseError || !parsed.code) {
      items.push({
        filename,
        code: '',
        title: '',
        price: 0,
        imageSlot: parsed.imageSlot || 1,
        warnings: ['invalid_filename'],
        parseError: parsed.parseError,
        websiteStatus: 'not_found',
        group: 'not_found',
      });
      groups.not_found += 1;
      continue;
    }

    const match = await resolveProductLoaderMatch(sb, {
      code: parsed.code,
      displayCode: parsed.displayCode,
      imageSlot: parsed.imageSlot,
      dormantSkus,
    });
    if (match.canPublish) matched += 1;
    const group = classifyBatchItem(match);
    groups[group] += 1;

    items.push({
      filename,
      ...match,
      group,
    });
  }

  return res.status(200).json({
    items,
    summary: {
      total: items.length,
      matched,
      ready: groups.ready,
      needsReview: groups.needs_review,
      notFound: groups.not_found,
      sqlConfigured: isSqlConfigured(),
    },
  });
}
