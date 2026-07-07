const STOCK_COLS = 'sku, title, category, available_stock, stock_qty, price, image_url_one';

export default {
  id: 'stock.zero_stock_list',
  adapter: 'supabase_stock',
  params: {
    limit: { type: 'number' },
  },
  maxRows: 25,
  timeoutMs: 15000,
  cacheTtlMs: 90000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 25), 25);

    const { data, error } = await client
      .from('website_stock')
      .select(STOCK_COLS)
      .eq('available_stock', 0)
      .order('title', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const products = (data || []).map((row) => ({
      sku: row.sku,
      title: row.title || row.sku,
      category: row.category || 'Uncategorised',
      stockOnHand: 0,
      price: row.price,
      imageUrl: firstImage(row.image_url_one),
    }));

    return {
      data: { products },
      source: ['stock_supabase'],
    };
  },
};

function firstImage(url) {
  return String(url || '').split(',')[0].trim() || null;
}
