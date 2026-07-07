const ORDER_COLS =
  'id, status, total_ex_vat, created_at, customer_id, '
  + 'customers(name, email, business_name)';

export default {
  id: 'portal.orders_recent',
  adapter: 'supabase_portal',
  params: {
    limit: { type: 'number' },
  },
  maxRows: 100,
  timeoutMs: 15000,
  cacheTtlMs: 90000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 50), 100);
    const { data, error } = await client
      .from('orders')
      .select(ORDER_COLS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const orders = (data || []).map((o) => ({
      id: o.id,
      status: o.status,
      totalExVat: o.total_ex_vat,
      createdAt: o.created_at,
      customerId: o.customer_id,
      customer: o.customers?.business_name || o.customers?.name || o.customers?.email || 'Unknown',
    }));

    return {
      data: { orders },
      source: ['portal_supabase'],
      partial: orders.length >= limit,
    };
  },
};
