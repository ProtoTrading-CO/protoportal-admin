/** Reprocess a staged New Items image slot through Gemini. */

export async function reprocessDormantSlot(sku, { slot = 1, prompt, imageStyle } = {}) {
  const res = await fetch('/api/reprocess-dormant-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, slot, prompt: prompt || undefined, imageStyle: imageStyle || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Image gen failed (${res.status})`);
  return json;
}

/**
 * @param {{ sku: string, title?: string, slots?: number[] }[]} targets
 * @param {{ prompt?: string, imageStyle?: string, onItemUpdate?: (index: number, patch: object) => void, signal?: AbortSignal }} opts
 */
export async function runDormantImageBatch(targets, { prompt, imageStyle, onItemUpdate, signal } = {}) {
  const queue = [];
  for (const t of targets) {
    const slots = t.slots?.length ? t.slots : [1, 2, 3, 4].filter((s) => s === 1 || t[`hasSlot${s}`]);
    const useSlots = slots.length ? slots : [1];
    for (const slot of useSlots) {
      queue.push({ sku: t.sku, title: t.title, slot });
    }
  }

  const results = { done: 0, failed: 0, items: [] };

  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break;
    const item = queue[i];
    const label = item.slot > 1 ? `${item.sku} (image ${item.slot})` : item.sku;

    onItemUpdate?.(i, {
      sku: item.sku,
      slot: item.slot,
      status: 'transforming',
      message: imageStyle === 'generative' ? 'Generative AI (Gemini 3 Pro)…' : imageStyle === 'shadow' ? 'White + shadow…' : 'Gemini 3 Pro processing…',
    });

    try {
      const json = await reprocessDormantSlot(item.sku, { slot: item.slot, prompt, imageStyle });
      results.done += 1;
      results.items.push({ sku: item.sku, slot: item.slot, ok: true, imageUrl: json.imageUrl });
      onItemUpdate?.(i, {
        status: 'done',
        message: 'Preview ready ✓',
        previewUrl: json.imageUrl,
        sourceUrl: json.sourceUrl,
      });
    } catch (err) {
      results.failed += 1;
      results.items.push({ sku: item.sku, slot: item.slot, ok: false, error: err.message });
      onItemUpdate?.(i, {
        status: 'error',
        message: err.message,
      });
    }
  }

  return results;
}
