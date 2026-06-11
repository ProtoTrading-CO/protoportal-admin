import { createClient } from '@supabase/supabase-js';
import { labelsToDbFields, loadTaxonomy, resolveLabelsForSubcategory } from './_taxonomy-utils.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function findProductTable(supabase, sku) {
  const { data: live } = await supabase.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
  if (live) return 'website_stock';
  const { data: archived } = await supabase.from('archived_products').select('sku').eq('sku', sku).maybeSingle();
  if (archived) return 'archived_products';
  return null;
}

async function moveProduct(supabase, sku, dbFields) {
  const table = await findProductTable(supabase, sku);
  if (!table) return { sku, ok: false, error: 'Not found' };
  const { error } = await supabase
    .from(table)
    .update({ ...dbFields, updated_at: new Date().toISOString() })
    .eq('sku', sku);
  if (error) return { sku, ok: false, error: error.message };
  return { sku, ok: true };
}

async function archiveProduct(supabase, sku) {
  const { data: live } = await supabase.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
  if (!live) return { sku, ok: false, error: 'Not in active catalogue' };
  const { error } = await supabase.rpc('archive_product', { p_sku: sku, p_by: 'admin-bulk' });
  if (error) return { sku, ok: false, error: error.message };
  return { sku, ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { action, skus, categoryId, subcategoryId } = req.body || {};
  const normalizedSkus = [...new Set((skus || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!normalizedSkus.length) return res.status(400).json({ error: 'No products selected' });

  const supabase = getStockClient();

  try {
    if (action === 'move') {
      if (!categoryId) return res.status(400).json({ error: 'Main category is required' });
      const tree = await loadTaxonomy();
      const labels = resolveLabelsForSubcategory(tree, categoryId, subcategoryId);
      if (labels.length < 2) return res.status(400).json({ error: 'Subcategory is required' });
      const dbFields = labelsToDbFields(labels);

      const results = [];
      for (const sku of normalizedSkus) {
        results.push(await moveProduct(supabase, sku, dbFields));
      }
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        moved: results.filter((r) => r.ok).length,
        failed,
      });
    }

    if (action === 'archive') {
      const results = [];
      for (const sku of normalizedSkus) {
        results.push(await archiveProduct(supabase, sku));
      }
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        archived: results.filter((r) => r.ok).length,
        failed,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Bulk operation failed' });
  }
}
