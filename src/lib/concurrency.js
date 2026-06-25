/** Run async fn on each item with at most `limit` in flight. */
export async function mapWithConcurrency(items, limit, fn) {
  const list = [...items];
  if (!list.length) return [];
  const cap = Math.max(1, limit);
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      results[i] = await fn(list[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(cap, list.length) }, () => worker()));
  return results;
}
