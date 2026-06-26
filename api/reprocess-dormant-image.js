import { requireAdminKey } from './_admin-auth.js';
import { fixImageFromUrl, IMAGE_STYLES, DEFAULT_IMAGE_MODEL } from './_image-pipeline.js';
import {
  extractImageGenMeta,
  fetchUsdToZarRate,
  logImageGenCost,
  getStockClient,
  resolveImageGenCost,
} from './_image-gen-cost.js';
import { assertImageGenBudgetAllowsSpend } from './_image-gen-budget.js';

const SLOT_FIELDS = {
  1: 'image_url_one',
  2: 'image_url_two',
  3: 'image_url_three',
  4: 'image_url_four',
};

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku, slot: slotRaw, prompt: userPrompt, imageStyle } = req.body || {};
  const cleanSku = String(sku || '').trim();
  const slot = Math.min(4, Math.max(1, Number(slotRaw) || 1));
  const field = SLOT_FIELDS[slot];
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const style = Object.values(IMAGE_STYLES).includes(imageStyle) ? imageStyle : IMAGE_STYLES.standard;
  const { operator, batchId } = extractImageGenMeta(req);
  const sb = getStockClient();
  const t0 = Date.now();

  try {
    await assertImageGenBudgetAllowsSpend(sb);
  } catch (err) {
    if (err.code === 'IMAGE_GEN_BUDGET_EXCEEDED') {
      return res.status(402).json({ error: err.message, budget: err.budgetStatus });
    }
    throw err;
  }

  const { data: row, error: lookupError } = await sb
    .from('archived_products')
    .select('*')
    .eq('sku', cleanSku)
    .eq('archived_by', 'new-products')
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) return res.status(404).json({ error: `No New Items staging row for "${cleanSku}"` });

  const sourceUrl = String(row[field] || row.image_url_one || '').split(',')[0].trim();
  if (!sourceUrl) return res.status(400).json({ error: `No image in slot ${slot} for "${cleanSku}"` });

  try {
    const result = await fixImageFromUrl(sourceUrl, {
      sku: cleanSku,
      imageStyle: style,
      userInstructions: userPrompt,
      productTitle: row.title,
      targetSlot: slot,
    });

    const { costUsd, costSource } = resolveImageGenCost({
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      isImageOutput: true,
    });
    const usdToZar = await fetchUsdToZarRate();
    const costMeta = await logImageGenCost(sb, {
      sku: cleanSku,
      slot,
      operation: 'transform',
      imageStyle: style,
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

    const { error: updateErr } = await sb
      .from('archived_products')
      .update({ [field]: result.url, updated_at: new Date().toISOString() })
      .eq('sku', cleanSku)
      .eq('archived_by', 'new-products');
    if (updateErr) throw new Error(updateErr.message);

    return res.status(200).json({
      ok: true,
      sku: cleanSku,
      slot,
      imageUrl: result.url,
      sourceUrl,
      imageStyle: style,
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
      sku: cleanSku,
      slot,
      operation: 'transform',
      imageStyle: style,
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
    console.error('reprocess-dormant-image:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Image generation failed' });
  }
}
