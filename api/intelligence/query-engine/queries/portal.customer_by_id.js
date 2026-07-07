export default {
  id: 'portal.customer_by_id',
  adapter: 'supabase_portal',
  params: {
    id: { type: 'string', required: true },
  },
  maxRows: 1,
  timeoutMs: 10000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const id = String(params.id || '').trim();
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;

    return {
      data: { customer: data || null },
      source: ['portal_supabase'],
    };
  },
};
