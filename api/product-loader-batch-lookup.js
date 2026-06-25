import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { getProductByCode } from './_sql-provider.js';
import { toSqlPreview } from './_sql-stmast.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];
const WEBSITE_STOCK_COLS =
  'sku, title, price, original_description, category, subcategory_one, subcategory_two, '
  + 'image_url_one, image_url_two, image_url_three, image_url_four, barcode, updated_at';

function parseFilename(filename) {
  const dot = String(filename || '').lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : String(filename || '');
  const normalizedStem = stem.trim();
  if (!normalizedStem) return { code: '', imageSlot: 1 };

  const match = normalizedStem.match(/^(?<sku>.+)-(?<imageNumber>\d+)$/);
  if (!match?.groups?.sku) {
    return { code: normalizedStem.toUpperCase(), imageSlot: 1 };
  }

  const code = String(match.groups.sku || '').trim().toUpperCase();
  const imageNumber = Number.parseInt(match.groups.imageNumber || '1', 10);
  const imageSlot = Number.isFinite(imageNumber) ? Math.min(4, Math.max(1, imageNumber)) : 1;
  return { code, imageSlot };
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
    const { code, imageSlot } = parseFilename(filename);
    const warnings = [];
    if (!code) {
      items.push({ filename, code: '', title: '', price: 0, imageSlot: 1, warnings: ['invalid_filename'] });
      continue;
    }

    const [websiteResult, sqlRow] = await Promise.all([
      sb.from('website_stock').select(WEBSITE_STOCK_COLS).eq('sku', code).maybeSingle(),
      getProductByCode(code).catch(() => null),
    ]);

    let websiteRow = websiteResult.data || null;
    if (!websiteRow) {
      const barcodeResult = await sb
        .from('website_stock')
        .select(WEBSITE_STOCK_COLS)
        .eq('barcode', code)
        .maybeSingle();
      websiteRow = barcodeResult.data || null;
    }

    const preview = toSqlPreview(sqlRow);
    const title = String(preview?.title || websiteRow?.title || '').trim();
    const price = Number(preview?.price ?? websiteRow?.price ?? 0);

    if (!websiteRow && !preview) warnings.push('not_in_catalog');
    if (websiteRow?.[SLOT_FIELDS[imageSlot - 1]]) warnings.push('image_exists');

    if (websiteRow || preview) matched += 1;

    items.push({
      filename,
      code,
      title: title || code,
      price,
      imageSlot,
      sqlRow: preview,
      websiteRow,
      warnings,
    });
  }

  return res.status(200).json({
    items,
    summary: { total: items.length, matched },
  });
}
