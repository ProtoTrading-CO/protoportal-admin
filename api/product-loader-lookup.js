import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { getProductByCode, isSqlConfigured } from './_sql-provider.js';

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

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  // Preserve original casing for display; uppercase only for SQL/Supabase lookups
  const rawInput = String(req.query.code || '').trim();
  if (!rawInput) return res.status(400).json({ error: 'code is required' });
  const code = rawInput.toUpperCase();

  const sqlAvailable = isSqlConfigured();
  const sb = getStockClient();

  // Step 1: website_stock (primary) + SQL provider (optional enrichment) — run in parallel
  const [websiteBySkuResult, sqlResult] = await Promise.allSettled([
    sb.from('website_stock').select(WEBSITE_STOCK_COLS).eq('sku', code).maybeSingle(),
    sqlAvailable ? getProductByCode(code) : Promise.resolve(null),
  ]);

  let websiteRow = websiteBySkuResult.status === 'fulfilled' ? (websiteBySkuResult.value?.data || null) : null;
  let matchedBy = websiteRow ? 'code' : null;

  // Step 2: barcode fallback in website_stock only if sku miss
  if (!websiteRow) {
    const barcodeResult = await sb
      .from('website_stock')
      .select(WEBSITE_STOCK_COLS)
      .eq('barcode', code)
      .maybeSingle();
    if (barcodeResult.data) {
      websiteRow = barcodeResult.data;
      matchedBy = 'barcode';
    }
  }

  // SQL enriches price/stock when available — website_stock is always the base
  const sqlRow = sqlResult.status === 'fulfilled' ? sqlResult.value : null;
  const dataSource = sqlRow ? 'sql' : 'website_stock';

  const existingImages = SLOT_FIELDS.map((f) => websiteRow?.[f]).filter(Boolean);

  const price = Number(sqlRow?.price ?? websiteRow?.price ?? 0);
  const available = sqlRow?.available ?? null;

  const warnings = [];
  if (!price) warnings.push('price_zero');
  if (available !== null && available <= 0) warnings.push('low_stock');
  if (websiteRow?.image_url_one) warnings.push('image_exists');

  return res.status(200).json({
    sqlRow,
    websiteRow,
    existingImages,
    matchedBy,
    dataSource,
    sqlAvailable,
    warnings,
  });
}
