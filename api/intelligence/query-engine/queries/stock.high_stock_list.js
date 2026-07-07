const STOCK_COLS = 'sku, title, category, available_stock, stock_qty, price, image_url_one';

export default {
  id: 'stock.high_stock_list',
  adapter: 'supabase_stock',
  params: {
    limit: { type: 'number' },
  },
  maxRows: 20,
  timeoutMs: 15000,
  cacheTtlMs: 90000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 20), 20);

    const { data, error } = await client
      .from('website_stock')
      .select(STOCK_COLS)
      .not('available_stock', 'is', null)
      .gt('available_stock', 0)
      .order('available_stock', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const products = (data || []).map((row) => ({
      sku: row.sku,
      title: row.title || row.sku,
      category: row.category || 'Uncategorised',
      stockOnHand: Number(row.available_stock) || Number(row.stock_qty) || 0,
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
