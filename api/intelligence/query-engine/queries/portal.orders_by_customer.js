const ORDER_COLS =
  'id, status, total_ex_vat, created_at, original_items, final_items, items';

export default {
  id: 'portal.orders_by_customer',
  adapter: 'supabase_portal',
  params: {
    customerId: { type: 'string', required: true },
    limit: { type: 'number' },
  },
  maxRows: 20,
  timeoutMs: 10000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const customerId = String(params.customerId || '').trim();
    const limit = Math.min(Math.max(1, Number(params.limit) || 20), 20);

    const { data, error } = await client
      .from('orders')
      .select(ORDER_COLS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const orders = (data || []).map((o) => ({
      id: o.id,
      status: o.status,
      totalExVat: o.total_ex_vat,
      createdAt: o.created_at,
    }));

    return {
      data: { orders, customerId },
      source: ['portal_supabase'],
    };
  },
};
