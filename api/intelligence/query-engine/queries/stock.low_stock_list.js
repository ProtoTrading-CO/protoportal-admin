const STOCK_COLS = 'sku, title, category, available_stock, stock_qty, price, image_url_one';

export default {
  id: 'stock.low_stock_list',
  adapter: 'supabase_stock',
  params: {
    limit: { type: 'number' },
    threshold: { type: 'number' },
  },
  maxRows: 25,
  timeoutMs: 15000,
  cacheTtlMs: 90000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 25), 25);
    const threshold = Math.min(50, Math.max(1, Number(params.threshold) || 10));

    const { data, error } = await client
      .from('website_stock')
      .select(STOCK_COLS)
      .gt('available_stock', 0)
      .lte('available_stock', threshold)
      .order('available_stock', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const products = (data || []).map((row) => ({
      sku: row.sku,
      title: row.title || row.sku,
      category: row.category || 'Uncategorised',
      stockOnHand: readStock(row.available_stock) ?? readStock(row.stock_qty),
      price: row.price,
      imageUrl: firstImage(row.image_url_one),
    }));

    return {
      data: { products, threshold },
      source: ['stock_supabase'],
    };
  },
};

function readStock(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function firstImage(url) {
  return String(url || '').split(',')[0].trim() || null;
}
