import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { getProductByCode, getSqlSetupMessage, isSqlConfigured } from './_sql-provider.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code is required' });

  const sqlAvailable = isSqlConfigured();
  const sb = getStockClient();

  const [sqlResult, websiteResult] = await Promise.allSettled([
    sqlAvailable ? getProductByCode(code) : Promise.resolve(null),
    sb
      .from('website_stock')
      .select(
        'sku, title, price, original_description, category, subcategory_one, subcategory_two, '
        + 'image_url_one, image_url_two, image_url_three, image_url_four, updated_at',
      )
      .eq('sku', code)
      .maybeSingle(),
  ]);

  const sqlRow = sqlResult.status === 'fulfilled' ? sqlResult.value : null;
  const websiteRow = websiteResult.status === 'fulfilled' ? (websiteResult.value?.data || null) : null;

  const existingImages = SLOT_FIELDS
    .map((f) => websiteRow?.[f])
    .filter(Boolean);

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
    sqlAvailable,
    sqlSetupMessage: sqlAvailable ? null : getSqlSetupMessage(),
    warnings,
  });
}
