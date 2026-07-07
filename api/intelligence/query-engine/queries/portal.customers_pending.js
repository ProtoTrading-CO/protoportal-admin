export default {
  id: 'portal.customers_pending',
  adapter: 'supabase_portal',
  params: {
    limit: { type: 'number' },
  },
  maxRows: 25,
  timeoutMs: 10000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 25), 25);
    const { data, error } = await client
      .from('customers')
      .select('id, name, email, phone, business_name, business_type, city, created_at')
      .eq('is_approved', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      data: { customers: data || [], count: (data || []).length },
      source: ['portal_supabase'],
    };
  },
};
