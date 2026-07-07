const CUSTOMER_COLS =
  'id, name, email, phone, business_name, business_type, city, province, tier, is_approved, created_at';

export default {
  id: 'portal.customers_search',
  adapter: 'supabase_portal',
  params: {
    q: { type: 'string', required: true },
    limit: { type: 'number' },
  },
  maxRows: 15,
  timeoutMs: 10000,
  cacheTtlMs: 60000,

  async run(client, params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 15), 15);
    const q = String(params.q || '').trim();
    const safe = q.replace(/[%',()]/g, ' ').trim();

    let query = client
      .from('customers')
      .select(CUSTOMER_COLS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,email.ilike.%${safe}%,business_name.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      data: { customers: data || [], query: q },
      source: ['portal_supabase'],
    };
  },
};
