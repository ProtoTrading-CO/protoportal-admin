import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { isSqlConfigured } from './_sql-provider.js';
import { resolveProductLoaderMatch, SLOT_FIELDS, parseLoaderFilename } from './_product-loader-lookup.js';

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
  const items = [];
  let matched = 0;

  for (const filename of filenames) {
    const { code, displayCode, imageSlot } = parseLoaderFilename(filename);
    if (!code) {
      items.push({ filename, code: '', title: '', price: 0, imageSlot: 1, warnings: ['invalid_filename'] });
      continue;
    }

    const match = await resolveProductLoaderMatch(sb, { code, displayCode, imageSlot });
    if (match.canPublish) matched += 1;

    items.push({
      filename,
      ...match,
    });
  }

  return res.status(200).json({
    items,
    summary: { total: items.length, matched },
  });
}
