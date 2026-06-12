/** Reprocess live catalogue products → Gemini image gen → staged preview in New Products. */

export async function reprocessOneToDormant(sku, { prompt, imageStyle } = {}) {
  const res = await fetch('/api/reprocess-live-to-dormant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, prompt: prompt || undefined, imageStyle: imageStyle || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Reprocess failed (${res.status})`);
  return json;
}

/**
 * @param {{ sku: string, title?: string, imageUrl?: string }[]} products
 * @param {{ prompt?: string, imageStyle?: string, onItemUpdate?: (index: number, patch: object) => void, signal?: AbortSignal }} opts
 */
export async function runReprocessBatch(products, { prompt, imageStyle, onItemUpdate, signal } = {}) {
  const queue = products.filter((p) => p?.sku);
  const results = { done: 0, failed: 0, items: [] };

  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break;
    const item = queue[i];

    onItemUpdate?.(i, {
      status: 'transforming',
      message: imageStyle === 'generative' ? 'Generative AI (Gemini 3 Pro)…' : imageStyle === 'shadow' ? 'White + shadow (Gemini 3 Pro)…' : 'Gemini 3 Pro processing…',
    });

    try {
      const json = await reprocessOneToDormant(item.sku, { prompt, imageStyle });
      results.done += 1;
      results.items.push({ sku: item.sku, ok: true, imageUrl: json.imageUrl, model: json.model });
      onItemUpdate?.(i, {
        status: 'done',
        message: json.stillLive ? 'Preview ready — still live on site ✓' : 'Staged in New Products ✓',
        previewUrl: json.imageUrl,
        sourceUrl: json.sourceUrl,
      });
    } catch (err) {
      results.failed += 1;
      results.items.push({ sku: item.sku, ok: false, error: err.message });
      onItemUpdate?.(i, {
        status: 'error',
        message: err.message,
      });
    }
  }

  return results;
}
