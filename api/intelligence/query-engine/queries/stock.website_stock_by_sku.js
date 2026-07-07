const WEBSITE_STOCK_COLS =
  'sku, title, price, category, subcategory_one, barcode, stock_qty, available_stock, image_url_one';

export default {
  id: 'stock.website_stock_by_sku',
  adapter: 'supabase_stock',
  params: {
    sku: { type: 'string', required: true },
  },
  maxRows: 1,
  timeoutMs: 10000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const sku = String(params.sku || '').trim().toUpperCase();
    const { data, error } = await client
      .from('website_stock')
      .select(WEBSITE_STOCK_COLS)
      .eq('sku', sku)
      .maybeSingle();

    if (error) throw error;

    return {
      data: { listing: data || null, sku },
      source: ['stock_supabase'],
    };
  },
};
