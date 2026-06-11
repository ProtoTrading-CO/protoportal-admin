import { createClient } from '@supabase/supabase-js';
import { labelToSlug } from './_taxonomy-utils.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const ids = [...new Set((req.body?.ids || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return res.status(200).json({});

  try {
    const supabase = getStockClient();
    const { data, error } = await supabase
      .from('website_stock')
      .select('sku, category')
      .in('sku', ids);
    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      map[row.sku] = {
        category: labelToSlug(row.category),
        categoryLabel: row.category || 'Other',
      };
    });
    return res.status(200).json(map);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Lookup failed' });
  }
}
