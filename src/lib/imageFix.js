/** Run the New Products image pipeline (OpenRouter Gemini) on one or many SKUs. */

export async function fixProductImage(sku) {
  const res = await fetch('/api/fix-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fix failed (${res.status})`);
  return json;
}

/**
 * @param {{ sku: string, title?: string }[]} products
 * @param {{ onProgress?: (state: object) => void, signal?: AbortSignal }} opts
 */
export async function runImageFixBatch(products, { onProgress, signal } = {}) {
  const queue = products.filter((p) => p?.sku);
  const results = { done: 0, failed: 0, skipped: 0, items: [] };

  for (let i = 0; i < queue.length; i++) {
    if (signal?.aborted) break;
    const item = queue[i];
    onProgress?.({
      index: i,
      total: queue.length,
      sku: item.sku,
      title: item.title || item.sku,
      status: 'running',
      done: results.done,
      failed: results.failed,
    });

    try {
      const json = await fixProductImage(item.sku);
      results.done += 1;
      results.items.push({ sku: item.sku, ok: true, imageUrl: json.imageUrl });
      onProgress?.({
        index: i,
        total: queue.length,
        sku: item.sku,
        title: item.title || item.sku,
        status: 'done',
        done: results.done,
        failed: results.failed,
      });
    } catch (err) {
      results.failed += 1;
      results.items.push({ sku: item.sku, ok: false, error: err.message });
      onProgress?.({
        index: i,
        total: queue.length,
        sku: item.sku,
        title: item.title || item.sku,
        status: 'error',
        error: err.message,
        done: results.done,
        failed: results.failed,
      });
    }
  }

  return results;
}
