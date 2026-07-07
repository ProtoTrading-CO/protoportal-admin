export default {
  id: 'stock.products_soh_by_skus',
  adapter: 'supabase_stock',
  params: {
    skus: { type: 'string', required: true },
  },
  maxRows: 500,
  timeoutMs: 15000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const raw = params.skus;
    const skuList = (Array.isArray(raw) ? raw : String(raw || '').split(','))
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 500);

    if (!skuList.length) {
      return { data: { products: [] }, source: ['stock_supabase'] };
    }

    const products = [];
    for (let i = 0; i < skuList.length; i += 500) {
      const chunk = skuList.slice(i, i + 500);
      const { data, error } = await client
        .from('products')
        .select('sku, stock_qty, available_stock, price')
        .in('sku', chunk);
      if (error) throw error;
      products.push(...(data || []));
    }

    return {
      data: { products },
      source: ['stock_supabase'],
    };
  },
};
