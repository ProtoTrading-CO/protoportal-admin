import { requireAdminKey } from './_admin-auth.js';
import { fixImageFromUrl, IMAGE_STYLES, DEFAULT_IMAGE_MODEL } from './_image-pipeline.js';
import { readSlotUrl, stageDormantSlotPreview } from './_stage-dormant.js';
import {
  acquireImageGenLock,
  acquireTransformSemaphore,
  extractImageGenMeta,
  fetchUsdToZarRate,
  getStockClient,
  logImageGenCost,
  releaseImageGenLock,
  resolveImageGenCost,
} from './_image-gen-cost.js';

const LIVE_SELECT = `
  id, sku, barcode, title, original_description,
  image_url_one, image_url_two, image_url_three, image_url_four,
  category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
  created_at, updated_at, price, stock_qty, available_stock, keep_live_when_oos
`;

function getClient() {
  return getStockClient();
}

function resolveStyle(imageStyle) {
  return Object.values(IMAGE_STYLES).includes(imageStyle) ? imageStyle : IMAGE_STYLES.shadow;
}

function firstSourceSlot(row) {
  for (let s = 1; s <= 4; s += 1) {
    if (readSlotUrl(row, s)) return s;
  }
  return 1;
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const {
    sku,
    prompt: userPrompt,
    imageStyle,
    targetSlot = 1,
    sourceSlot,
    referenceImageUrl,
  } = req.body || {};
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const style = resolveStyle(imageStyle);
  const slot = Math.min(4, Math.max(1, Number(targetSlot) || 1));
  const { operator, batchId } = extractImageGenMeta(req);

  const sb = getClient();
  let lockHeld = false;

  try {
    if (batchId) {
      await acquireTransformSemaphore(sb, { batchId, operator });
    }

    const lock = await acquireImageGenLock(sb, { sku: cleanSku, slot, batchId, operator });
    lockHeld = lock.locked;

    const { data: row, error: lookupError } = await sb
      .from('website_stock')
      .select(LIVE_SELECT)
      .eq('sku', cleanSku)
      .maybeSingle();

    if (lookupError) return res.status(400).json({ error: lookupError.message });
    if (!row) {
      return res.status(404).json({ error: `Live product "${cleanSku}" not found` });
    }

    const srcSlot = sourceSlot ? Math.min(4, Math.max(1, Number(sourceSlot))) : firstSourceSlot(row);
    const sourceUrl = readSlotUrl(row, srcSlot);
    if (!sourceUrl) return res.status(400).json({ error: 'Product has no source image to reprocess' });

    const t0 = Date.now();
    let imageUrl;
    let model;
    let tokensIn;
    let tokensOut;
    let costUsdFromApi = null;

    try {
      const result = await fixImageFromUrl(sourceUrl, {
        sku: cleanSku,
        imageStyle: style,
        userInstructions: userPrompt,
        productTitle: row.title,
        productDescription: row.original_description,
        referenceImageUrl: referenceImageUrl || undefined,
        targetSlot: slot,
        staging: true,
      });
      imageUrl = result.url;
      model = result.model;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      costUsdFromApi = result.costUsd;
    } catch (genErr) {
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
        costZar: costUsd * usdToZar,
        usdToZar,
        processingMs: Date.now() - t0,
        operator,
        batchId,
        status: 'error',
        error: genErr.message,
      });
      throw genErr;
    }

    const { costUsd, costSource } = resolveImageGenCost({
      model,
      tokensIn,
      tokensOut,
      costUsd: costUsdFromApi,
      isImageOutput: true,
    });
    const costMeta = await logImageGenCost(sb, {
      sku: cleanSku,
      slot,
      operation: 'transform',
      imageStyle: style,
      model,
      tokensIn,
      tokensOut,
      costUsd,
      costSource,
      processingMs: Date.now() - t0,
      operator,
      batchId,
      status: 'ok',
    });

    const { stillLive } = await stageDormantSlotPreview(sb, row, {
      slot,
      imageUrl,
      stagedBy: operator,
      stagedBatchId: batchId,
    });

    return res.status(200).json({
      ok: true,
      sku: cleanSku,
      title: row.title,
      imageUrl,
      sourceUrl,
      sourceSlot: srcSlot,
      targetSlot: slot,
      category: row.category,
      stillLive,
      imageStyle: style,
      model,
      tokensIn,
      tokensOut,
      costUsd: costMeta.costUsd,
      costZar: costMeta.costZar,
      usdToZar: costMeta.usdToZar,
      processingMs: Date.now() - t0,
      operator,
    });
  } catch (err) {
    console.error('reprocess-live-to-dormant:', err?.message || err);
    const status = /in use by/i.test(err.message) ? 409 : 500;
    return res.status(status).json({ error: err.message || 'Reprocess failed' });
  } finally {
    if (lockHeld) await releaseImageGenLock(sb, cleanSku, slot);
  }
}
