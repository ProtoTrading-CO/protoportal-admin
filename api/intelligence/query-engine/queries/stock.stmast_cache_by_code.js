export default {
  id: 'stock.stmast_cache_by_code',
  adapter: 'supabase_stock',
  params: {
    code: { type: 'string', required: true },
  },
  maxRows: 1,
  timeoutMs: 10000,
  cacheTtlMs: 300000,

  async run(client, params) {
    const code = String(params.code || '').trim().toUpperCase();

    const { data, error } = await client
      .from('stmast_cache')
      .select('code, descr, supplier, dept, onhand, booked, barcode, price_a')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;

    return {
      data: { row: data || null, code },
      source: ['stmast_cache'],
    };
  },
};
