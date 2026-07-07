const LISTING_COLS = 'sku, title, category, updated_at, price';

export default {
  id: 'stock.listings_since',
  adapter: 'supabase_stock',
  params: {
    since: { type: 'string', required: true },
    limit: { type: 'number' },
  },
  maxRows: 50,
  timeoutMs: 15000,
  cacheTtlMs: 120000,

  async run(client, params) {
    const since = String(params.since || '').trim();
    const limit = Math.min(Math.max(1, Number(params.limit) || 50), 50);

    const { data, error } = await client
      .from('website_stock')
      .select(LISTING_COLS)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      data: { listings: data || [], since },
      source: ['stock_supabase'],
    };
  },
};
