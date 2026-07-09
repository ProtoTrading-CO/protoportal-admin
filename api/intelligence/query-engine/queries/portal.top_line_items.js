const ORDER_COLS = 'id, created_at, status, original_items, final_items, items';

/** SAST (UTC+2, no DST) — Proto business day boundaries. */
function sastDayBounds(period, now = new Date()) {
  const offsetMs = 2 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const dayStartUtc = new Date(Date.UTC(y, m, d) - offsetMs);

  if (period === 'today') {
    return { start: dayStartUtc, end: now, label: 'today (SAST)' };
  }
  if (period === 'yesterday') {
    const yStart = new Date(dayStartUtc.getTime() - 24 * 60 * 60 * 1000);
    return { start: yStart, end: dayStartUtc, label: 'yesterday (SAST)' };
  }
  if (period === 'last_week') {
    return { start: new Date(dayStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000), end: now, label: 'last 7 days' };
  }
  return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now, label: 'last 30 days' };
}

function extractOrderItems(order) {
  const raw = order.final_items || order.items || order.original_items || [];
  return Array.isArray(raw) ? raw : [];
}

function aggregateLineItems(orders, { scope = 'top_sellers' } = {}) {
  const lineCounts = new Map();
  for (const order of orders) {
    for (const item of extractOrderItems(order)) {
      const code = String(item.code || item.productId || item.sku || 'unknown').trim();
      const name = String(item.name || item.title || code).trim();
      const qty = Number(item.qty) || 0;
      if (!qty) continue;
      const prev = lineCounts.get(code) || { code, name, totalQty: 0, orderCount: 0 };
      prev.totalQty += qty;
      prev.orderCount += 1;
      lineCounts.set(code, prev);
    }
  }

  let rows = [...lineCounts.values()];
  if (scope === 'worst_sellers') {
    rows = rows.filter((r) => r.totalQty > 0).sort((a, b) => a.totalQty - b.totalQty);
  } else {
    rows.sort((a, b) => b.totalQty - a.totalQty);
  }
  return rows;
}

export default {
  id: 'portal.top_line_items',
  adapter: 'supabase_portal',
  params: {
    period: { type: 'string' },
    scope: { type: 'string' },
    limit: { type: 'number' },
  },
  maxRows: 500,
  timeoutMs: 20000,
  cacheTtlMs: 120000,

  async run(client, params) {
    const period = String(params.period || 'general');
    const scope = String(params.scope || 'top_sellers');
    const limit = Math.min(Math.max(1, Number(params.limit) || 10), 25);
    const { start, end, label } = sastDayBounds(period === 'general' ? 'general' : period);

    const { data, error } = await client
      .from('orders')
      .select(ORDER_COLS)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const orders = data || [];
    const items = aggregateLineItems(orders, { scope }).slice(0, limit);

    return {
      data: {
        period,
        periodLabel: label,
        scope,
        orderCount: orders.length,
        items,
      },
      source: ['portal_supabase'],
      partial: orders.length >= 500,
      generatedAt: new Date().toISOString(),
    };
  },
};
