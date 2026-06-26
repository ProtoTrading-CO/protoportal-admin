import { requireAdminKey } from './_admin-auth.js';
import { fixImageFromBase64, DEFAULT_IMAGE_MODEL } from './_image-pipeline.js';
import {
  extractImageGenMeta,
  fetchUsdToZarRate,
  getStockClient,
  logImageGenCost,
  resolveImageGenCost,
} from './_image-gen-cost.js';
import { assertImageGenBudgetAllowsSpend } from './_image-gen-budget.js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64, prompt, imageStyle } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ error: 'Please upload a JPG, PNG, or WEBP image.' });
  }

  const { operator, batchId } = extractImageGenMeta(req);
  const sku = String(filename || '').replace(/\.[^.]+$/, '').trim() || null;
  const t0 = Date.now();
  const sb = getStockClient();

  try {
    await assertImageGenBudgetAllowsSpend(sb);
  } catch (err) {
    if (err.code === 'IMAGE_GEN_BUDGET_EXCEEDED') {
      return res.status(402).json({ error: err.message, budget: err.budgetStatus });
    }
    throw err;
  }

  try {
    const result = await fixImageFromBase64(base64, contentType, filename, {
      userInstructions: prompt,
      imageStyle: imageStyle || 'standard',
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
      sku,
      operation: 'transform',
      imageStyle: result.imageStyle,
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
      url: result.url,
      base64: result.base64,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      imageStyle: result.imageStyle,
      costUsd: costMeta.costUsd,
      costZar: costMeta.costZar,
      processingMs: Date.now() - t0,
    });
  } catch (error) {
    const { costUsd, costSource } = resolveImageGenCost({ model: DEFAULT_IMAGE_MODEL, isImageOutput: true });
    const usdToZar = await fetchUsdToZarRate();
    await logImageGenCost(sb, {
      sku,
      operation: 'transform',
      imageStyle: imageStyle || 'standard',
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
      error: error.message,
    });
    console.error('transform-product-image:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Gemini image generation failed' });
  }
}
