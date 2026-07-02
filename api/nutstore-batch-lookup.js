import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { isSqlConfigured } from './_sql-provider.js';
import { nutstoreBasename, parseNutstoreFilename } from './_nutstore-filename.js';
import { isPathInLibrary } from './_nutstore-webdav.js';
import {
  classifyBatchItem,
  fetchDormantSkuSet,
  resolveProductLoaderMatch,
} from './_product-loader-lookup.js';

const MAX_PATHS = 100;
const LOOKUP_CONCURRENCY = 8;

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function resolvePath(sb, rawPath, dormantSkus, codeOverride = '') {
  const path = String(rawPath || '').trim();
  if (!isPathInLibrary(path)) {
    return {
      path,
      filename: nutstoreBasename(path),
      code: '',
      title: '',
      price: 0,
      imageSlot: 1,
      warnings: ['invalid_filename'],
      parseError: 'outside_library',
      websiteStatus: 'not_found',
      group: 'not_found',
    };
  }

  const filename = nutstoreBasename(path);
  const override = String(codeOverride || '').trim();
  if (override) {
    const code = override.toUpperCase();
    const match = await resolveProductLoaderMatch(sb, {
      code,
      displayCode: override,
      imageSlot: 1,
      dormantSkus,
    });
    const group = classifyBatchItem(match);
    return {
      path,
      filename,
      ...match,
      imageSlot: 1,
      group,
    };
  }

  const parsed = parseNutstoreFilename(filename);

  if (parsed.parseError || !parsed.code) {
    return {
      path,
      filename,
      code: '',
      title: '',
      price: 0,
      imageSlot: 1,
      warnings: ['invalid_filename'],
      parseError: parsed.parseError,
      websiteStatus: 'not_found',
      group: 'not_found',
    };
  }

  const match = await resolveProductLoaderMatch(sb, {
    code: parsed.code,
    displayCode: parsed.displayCode,
    imageSlot: 1,
    dormantSkus,
  });
  const group = classifyBatchItem(match);

  return {
    path,
    filename,
    ...match,
    imageSlot: 1,
    group,
  };
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { paths, codeOverrides = {} } = req.body || {};
  if (!Array.isArray(paths) || !paths.length) {
    return res.status(400).json({ error: 'paths[] required (Nutstore file paths)' });
  }
  if (paths.length > MAX_PATHS) {
    return res.status(400).json({ error: `Maximum ${MAX_PATHS} paths per lookup (got ${paths.length})` });
  }

  const sb = getStockClient();
  const dormantSkus = await fetchDormantSkuSet(sb).catch(() => new Set());
  const overrides = codeOverrides && typeof codeOverrides === 'object' ? codeOverrides : {};
  const items = await mapPool(
    paths,
    LOOKUP_CONCURRENCY,
    (rawPath) => resolvePath(sb, rawPath, dormantSkus, overrides[rawPath]),
  );

  let matched = 0;
  const groups = { ready: 0, needs_review: 0, not_found: 0 };
  for (const item of items) {
    if (item.canPublish) matched += 1;
    groups[item.group] = (groups[item.group] || 0) + 1;
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
