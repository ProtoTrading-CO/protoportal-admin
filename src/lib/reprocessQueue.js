/** Reprocess live catalogue products → Gemini image gen → staged preview. */

export async function reprocessOneToDormant(sku, {
  prompt,
  imageStyle,
  targetSlot = 1,
  sourceSlot,
  referenceImageUrl,
} = {}) {
  const res = await fetch('/api/reprocess-live-to-dormant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku,
      prompt: prompt || undefined,
      imageStyle: imageStyle || undefined,
      targetSlot,
      sourceSlot,
      referenceImageUrl: referenceImageUrl || undefined,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Reprocess failed (${res.status})`);
  return json;
}

function styleMessage(imageStyle, slot) {
  const slotNote = slot > 1 ? ` slot ${slot}` : '';
  if (imageStyle === 'generative') return `Generative AI${slotNote}…`;
  if (imageStyle === 'measurements') return `Measurements overlay${slotNote}…`;
  if (imageStyle === 'shadow') return `White + shadow${slotNote}…`;
  return `Processing${slotNote}…`;
}

function buildWorkItems(products, { fillSlots = false } = {}) {
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
    const slots = p.slots || [1];
    let expanded;
    if (fillSlots) {
      const empty = [2, 3, 4].filter((s) => !hasImage(s));
      expanded = [1, ...empty];
    } else {
      expanded = slots;
    }
    const uniqueSlots = [...new Set(expanded.length ? expanded : [1])];
    for (const slot of uniqueSlots) {
      work.push({
        sku: p.sku,
        title: p.title || p.name || p.sku,
        thumbUrl: hasImage(slot) ? (images[slot - 1] || p.imageUrl || p.image) : (images[0] || p.imageUrl || p.image),
        slot,
        sourceSlot: hasImage(slot) ? slot : (hasImage(1) ? 1 : undefined),
      });
    }
  }
  return work;
}

/**
 * @param {{ sku: string, title?: string, imageUrl?: string, images?: string[], slots?: number[] }[]} products
 * @param {{ prompt?: string, imageStyle?: string, referenceImageUrl?: string, fillSlots?: boolean, onItemUpdate?: (index: number, patch: object) => void, signal?: AbortSignal }} opts
 */
export async function runReprocessBatch(products, {
  prompt,
  imageStyle,
  referenceImageUrl,
  fillSlots = false,
  onItemUpdate,
  signal,
} = {}) {
  const queue = buildWorkItems(products, { fillSlots });
  const results = { done: 0, failed: 0, items: [] };

  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break;
    const item = queue[i];

    onItemUpdate?.(i, {
      status: 'transforming',
      message: styleMessage(imageStyle, item.slot),
      slot: item.slot,
    });

    try {
      const json = await reprocessOneToDormant(item.sku, {
        prompt,
        imageStyle,
        targetSlot: item.slot,
        sourceSlot: item.sourceSlot || 1,
        referenceImageUrl,
      });
      results.done += 1;
      results.items.push({ sku: item.sku, slot: item.slot, ok: true, imageUrl: json.imageUrl });
      onItemUpdate?.(i, {
        status: 'done',
        message: json.stillLive ? 'Preview staged ✓' : 'Staged ✓',
        previewUrl: json.imageUrl,
        sourceUrl: json.sourceUrl,
        slot: item.slot,
      });
    } catch (err) {
      results.failed += 1;
      results.items.push({ sku: item.sku, slot: item.slot, ok: false, error: err.message });
      onItemUpdate?.(i, {
        status: 'error',
        message: err.message,
        slot: item.slot,
      });
    }
  }

  return results;
}

/** Expand selected products into slot-aware batch for Apollo wizard. */
export function expandProductSlots(products, { fillSlots = false, defaultSlots = [1] } = {}) {
  return products.map((p) => {
    const images = p.images || [p.image, p.secondaryImage, p.imageThree, p.imageFour].filter(Boolean);
    let slots = defaultSlots;
    if (fillSlots) {
      slots = [1, 2, 3, 4].filter((s) => {
        const has = !!(images[s - 1]);
        return !has || s === 1;
      });
      if (!slots.length) slots = [1];
    }
    return { ...p, images, slots };
  });
}
