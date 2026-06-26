import { requireAdminKey } from './_admin-auth.js';
import { fixImageFromUrl, DEFAULT_IMAGE_MODEL } from './_image-pipeline.js';
import {
  extractImageGenMeta,
  fetchUsdToZarRate,
  getStockClient,
  logImageGenCost,
  resolveImageGenCost,
} from './_image-gen-cost.js';
import { assertImageGenBudgetAllowsSpend } from './_image-gen-budget.js';
import { removeStorageObjects } from './_staging-storage.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku } = req.body || {};
  if (!sku) return res.status(400).json({ error: 'sku is required' });

  const sb = getStockClient();

  try {
    await assertImageGenBudgetAllowsSpend(sb);
  } catch (err) {
    if (err.code === 'IMAGE_GEN_BUDGET_EXCEEDED') {
      return res.status(402).json({ error: err.message, budget: err.budgetStatus });
    }
    throw err;
  }

  const { data: row, error: lookupError } = await sb
    .from('website_stock')
    .select('sku, title, image_url_one')
    .eq('sku', String(sku).trim())
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) return res.status(404).json({ error: 'Product not found' });

  const imageUrl = String(row.image_url_one || '').split(',')[0].trim();
  if (!imageUrl) return res.status(400).json({ error: 'Product has no image to fix' });

  const { operator, batchId } = extractImageGenMeta(req);
  const t0 = Date.now();

  try {
    const result = await fixImageFromUrl(imageUrl, { sku: row.sku });

    const { error: updateError } = await sb
      .from('website_stock')
      .update({ image_url_one: result.url, updated_at: new Date().toISOString() })
      .eq('sku', row.sku);
    if (updateError) {
      await removeStorageObjects(sb, [result.url]);
      return res.status(400).json({ error: updateError.message });
    }

    const { costUsd, costSource } = resolveImageGenCost({
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      isImageOutput: true,
    });
    const usdToZar = await fetchUsdToZarRate();
    const costMeta = await logImageGenCost(sb, {
      sku: row.sku,
      slot: 1,
      operation: 'fix',
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd,
      costSource,
      usdToZar,
      processingMs: Date.now() - t0,
      operator,
      batchId,
      status: 'ok',
    });

    return res.status(200).json({
      ok: true,
      sku: row.sku,
      title: row.title,
      imageUrl: result.url,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: costMeta.costUsd,
      costZar: costMeta.costZar,
      processingMs: Date.now() - t0,
    });
  } catch (err) {
    const { costUsd, costSource } = resolveImageGenCost({ model: DEFAULT_IMAGE_MODEL, isImageOutput: true });
    const usdToZar = await fetchUsdToZarRate();
    await logImageGenCost(sb, {
      sku: row.sku,
      slot: 1,
      operation: 'fix',
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd,
      costSource,
      usdToZar,
      processingMs: Date.now() - t0,
      operator,
      batchId,
      status: 'error',
      error: err.message,
    });
    console.error('fix-product-image:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Image fix failed' });
  }
}
