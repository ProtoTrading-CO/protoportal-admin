/** Reprocess live catalogue products → Gemini 800×800 → New Products (dormant). */

export async function reprocessOneToDormant(sku) {
  const res = await fetch('/api/reprocess-live-to-dormant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Reprocess failed (${res.status})`);
  return json;
}

/**
 * @param {{ sku: string, title?: string, imageUrl?: string }[]} products
 * @param {{ onItemUpdate?: (index: number, patch: object) => void, signal?: AbortSignal }} opts
 */
export async function runReprocessBatch(products, { onItemUpdate, signal } = {}) {
  const queue = products.filter((p) => p?.sku);
  const results = { done: 0, failed: 0, items: [] };

  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break;
    const item = queue[i];

    onItemUpdate?.(i, {
      status: 'transforming',
      message: 'Gemini fixing (800×800 white)…',
    });

    try {
      const json = await reprocessOneToDormant(item.sku);
      results.done += 1;
      results.items.push({ sku: item.sku, ok: true, imageUrl: json.imageUrl });
      onItemUpdate?.(i, {
        status: 'done',
        message: 'Moved to New Products ✓',
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
