import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { labelsToDbFields, loadTaxonomy, resolveCategoryIds } from './_taxonomy-utils.js';

const COMING_SOON_FILE = 'site-config/coming-soon.json';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function normalizeLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function resolveLabelsFromRow(tree, row) {
  const main = String(row.mainCategory || row.main_category || '').trim();
  const subs = [
    row.subCategory1 || row.sub_category_1,
    row.subCategory2 || row.sub_category_2,
    row.subCategory3 || row.sub_category_3,
  ].map((s) => String(s || '').trim()).filter(Boolean);

  if (!main) throw new Error('Main Category is required');

  const mainNode = tree.find((n) => normalizeLabel(n.label) === normalizeLabel(main));
  if (!mainNode) throw new Error(`Unknown main category "${main}"`);

  const labels = [mainNode.label];
  let children = mainNode.children || [];
  for (const subLabel of subs) {
    const child = children.find((n) => normalizeLabel(n.label) === normalizeLabel(subLabel));
    if (!child) throw new Error(`Unknown subcategory "${subLabel}" under "${mainNode.label}"`);
    labels.push(child.label);
    children = child.children || [];
  }
  return labels;
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { rows = [] } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  const sb = getStockClient();
  const tree = await loadTaxonomy();
  const results = [];

  for (const raw of rows) {
    const sku = String(raw.sku || raw.SKU || '').trim();
    const description = String(raw.description || raw.Description || sku).trim();
    if (!sku) {
      results.push({ sku: '', ok: false, error: 'Missing SKU' });
      continue;
    }

    try {
      const labels = resolveLabelsFromRow(tree, {
        mainCategory: raw.mainCategory || raw['Main Category'],
        subCategory1: raw.subCategory1 || raw['Sub Category 1'],
        subCategory2: raw.subCategory2 || raw['Sub Category 2'],
        subCategory3: raw.subCategory3 || raw['Sub Category 3'],
      });
      const dbFields = labelsToDbFields(labels);
      const { categoryPath } = resolveCategoryIds({ ...dbFields }, tree);

      const { data: live } = await sb.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
      const { data: archived } = await sb.from('archived_products').select('sku, archived_by').eq('sku', sku).maybeSingle();
      if (live) {
        results.push({ sku, ok: false, error: 'Already live on website' });
        continue;
      }
      if (archived && archived.archived_by !== 'new-products') {
        results.push({ sku, ok: false, error: `Already archived as "${archived.archived_by}"` });
        continue;
      }

      const now = new Date().toISOString();
      const payload = {
        sku,
        barcode: sku,
        title: description,
        original_description: description,
        image_url_one: null,
        image_url_two: null,
        image_url_three: null,
        image_url_four: null,
        ...dbFields,
        created_at: now,
        updated_at: now,
        archived_at: now,
        archived_by: 'new-products',
      };

      if (archived) {
        const { error } = await sb.from('archived_products').update({
          title: payload.title,
          original_description: payload.original_description,
          ...dbFields,
          updated_at: now,
        }).eq('sku', sku);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb.from('archived_products').insert(payload);
        if (error) throw new Error(error.message);
      }

      results.push({ sku, ok: true, categoryPath, labels });
    } catch (err) {
      results.push({ sku, ok: false, error: err.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return res.status(failed.length && failed.length === results.length ? 400 : failed.length ? 207 : 200).json({
    ok: failed.length === 0,
    imported: results.filter((r) => r.ok).length,
    failed,
    results,
  });
}
