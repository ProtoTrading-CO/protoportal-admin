import { imageGenHeaders } from './imageGenSession.js';

/** Reprocess live catalogue products → Gemini image gen → staged preview. */

async function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export async function reprocessOneToDormant(sku, {
  prompt,
  imageStyle,
  targetSlot = 1,
  sourceSlot,
  referenceImageUrl,
  batchId,
  retries = 5,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const res = await fetch('/api/reprocess-live-to-dormant', {
      method: 'POST',
      headers: imageGenHeaders(batchId),
      body: JSON.stringify({
        sku,
        prompt: prompt || undefined,
        imageStyle: imageStyle || undefined,
        targetSlot,
        sourceSlot,
        referenceImageUrl: referenceImageUrl || undefined,
        batchId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 409 && attempt < retries - 1) {
      lastErr = new Error(json.error || 'SKU slot locked — waiting for other user…');
      await sleep(3000 + attempt * 2500 + Math.random() * 1500);
      continue;
    }
    if (!res.ok) throw new Error(json.error || `Reprocess failed (${res.status})`);
    return json;
  }
  throw lastErr || new Error('Reprocess failed after retries');
}

function styleMessage(imageStyle, slot) {
  const angles = { 1: 'front', 2: '45°', 3: 'side', 4: 'detail' };
  const angle = angles[slot] ? ` · ${angles[slot]}` : '';
  const slotNote = slot > 1 ? ` slot ${slot}${angle}` : `${angle}`;
  if (imageStyle === 'generative') return `Generative AI${slotNote}…`;
  if (imageStyle === 'measurements') return `Measurements${slotNote}…`;
  if (imageStyle === 'shadow') return `White + shadow${slotNote}…`;
  return `Processing${slotNote}…`;
}

/** @typedef {{ enabled?: boolean, style?: string, prompt?: string, referenceUrl?: string }} SlotPlan */

function buildWorkItems(products, slotPlans = {}) {
  const enabledSlots = [1, 2, 3, 4].filter((s) => slotPlans[s]?.enabled);
  const work = [];

  for (const p of products) {
    if (!p?.sku) continue;
    const images = p.images || p.imageUrls || [
      p.imageUrl || p.image,
      p.imageTwo,
      p.imageThree,
      p.imageFour,
    ].filter(Boolean);
    const hasImage = (slot) => {
      const idx = slot - 1;
      return !!(images[idx] || (slot === 1 && (p.imageUrl || p.image)));
    };
    const primarySource = hasImage(1) ? 1 : enabledSlots.find((s) => hasImage(s)) || 1;

    for (const slot of enabledSlots) {
      const plan = slotPlans[slot] || {};
      const sourceForSlot = hasImage(slot) ? slot : primarySource;
      work.push({
        sku: p.sku,
        title: p.title || p.name || p.sku,
        thumbUrl: hasImage(slot) ? (images[slot - 1] || p.imageUrl || p.image) : (images[0] || p.imageUrl || p.image),
        slot,
        sourceSlot: sourceForSlot,
        style: plan.style || 'shadow',
        prompt: String(plan.prompt || '').trim(),
        referenceUrl: String(plan.referenceUrl || '').trim(),
      });
    }
  }
  return work;
}

/**
 * @param {{ sku: string, title?: string, imageUrl?: string, images?: string[] }[]} products
 * @param {{ slotPlans?: Record<number, SlotPlan>, onItemUpdate?: (index: number, patch: object) => void, signal?: AbortSignal, batchId?: string }} opts
 */
export async function runReprocessBatch(products, {
  slotPlans,
  batchId,
  onItemUpdate,
  signal,
} = {}) {
  const queue = buildWorkItems(products, slotPlans);
  const results = { done: 0, failed: 0, items: Array(queue.length).fill(null) };

  queue.forEach((item, i) => {
    onItemUpdate?.(i, {
      status: 'transforming',
      message: styleMessage(item.style, item.slot),
      slot: item.slot,
    });
  });

  await Promise.all(queue.map(async (item, i) => {
    if (signal?.aborted) return;
    try {
      const json = await reprocessOneToDormant(item.sku, {
        prompt: item.prompt || undefined,
        imageStyle: item.style,
        targetSlot: item.slot,
        sourceSlot: item.sourceSlot || 1,
        referenceImageUrl: item.referenceUrl || undefined,
        batchId,
      });
      results.done += 1;
      results.items[i] = { sku: item.sku, slot: item.slot, ok: true, imageUrl: json.imageUrl };
      onItemUpdate?.(i, {
        status: 'done',
        message: json.stillLive ? 'Preview staged ✓' : 'Staged ✓',
        previewUrl: json.imageUrl,
        sourceUrl: json.sourceUrl,
        slot: item.slot,
      });
    } catch (err) {
      results.failed += 1;
      results.items[i] = { sku: item.sku, slot: item.slot, ok: false, error: err.message };
      onItemUpdate?.(i, {
        status: 'error',
        message: err.message,
        slot: item.slot,
      });
    }
  }));

  return results;
}

/** Expand selected products for Apollo wizard (slots come from slotPlans at batch time). */
export function expandProductSlots(products, { defaultSlots = [1] } = {}) {
  return products.map((p) => {
    const images = p.images || [p.image, p.secondaryImage, p.imageThree, p.imageFour].filter(Boolean);
    const slots = defaultSlots;
    return { ...p, images, slots };
  });
}

export function countRecipeJobs(productCount, slotPlans) {
  const slots = [1, 2, 3, 4].filter((s) => slotPlans?.[s]?.enabled).length;
  return productCount * slots;
}

export function recipeSummary(slotPlans) {
  const STYLE_LABELS = { shadow: 'White BG', generative: 'Generative AI', measurements: 'Measurements' };
  return [1, 2, 3, 4]
    .filter((s) => slotPlans?.[s]?.enabled)
    .map((s) => {
      const p = slotPlans[s];
      const style = STYLE_LABELS[p?.style] || p?.style || 'White BG';
      const prompt = String(p?.prompt || '').trim();
      return prompt ? `Image ${s} · ${style} · “${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}”` : `Image ${s} · ${style}`;
    });
}
