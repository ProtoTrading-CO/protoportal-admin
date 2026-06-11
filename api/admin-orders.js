import { createClient } from '@supabase/supabase-js';
import { advanceOrderStatus, normalizeOrderStatus } from './_order-status.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  const supabase = getAdminClient();

  // GET — list orders (service role bypasses RLS)
  if (req.method === 'GET') {
    const { limit = '150', customerId = '', id = '' } = req.query;
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 150));

    let ordersQuery = supabase
      .from('orders')
      .select('*, customers(name, email, phone, business_name, business_type, city, province, country, tier)')
      .order('created_at', { ascending: false })
      .limit(lim);

    if (id) ordersQuery = ordersQuery.eq('id', id);
    if (customerId) ordersQuery = ordersQuery.eq('customer_id', customerId);

    const { data, error } = await ordersQuery;

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  }

  // PATCH — update an order
  if (req.method === 'PATCH') {
    const { id, notes, advanceWorkflow, ...raw } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    if (advanceWorkflow) {
      const target = normalizeOrderStatus(advanceWorkflow);
      if (target !== 'order sent' && target !== 'payment received') {
        return res.status(400).json({ error: 'Manual advance only supports order sent or payment received' });
      }
      try {
        const result = await advanceOrderStatus(supabase, id, target);
        if (!result.ok) {
          return res.status(409).json({ error: `Cannot advance to "${target}" from "${result.current || 'unknown'}"` });
        }
        const { data, error } = await supabase
          .from('orders')
          .select('*, customers(name, email, phone, business_name, business_type, city, province, country, tier)')
          .eq('id', id)
          .single();
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ row: data });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const patch = { ...raw };
    if (notes !== undefined) patch.order_change_notes = notes;

    if (patch.status === 'viewed' && !patch.viewed_at) patch.viewed_at = new Date().toISOString();
    if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
    if (patch.status === 'delivered' && !patch.delivered_at) patch.delivered_at = new Date().toISOString();

    const allowed = new Set([
      'status', 'final_items', 'original_items', 'order_change_notes', 'order_match',
      'replacement_map', 'viewed_at', 'paid_at', 'delivered_at', 'total_ex_vat',
      'handed_over_at', 'order_in_progress_at', 'order_sent_at', 'payment_received_at',
    ]);
    const sanitized = {};
    for (const [key, value] of Object.entries(patch)) {
      if (allowed.has(key)) sanitized[key] = value;
    }

    const { data, error } = await supabase
      .from('orders')
      .update(sanitized)
      .eq('id', id)
      .select('*, customers(name, email, phone, business_name, business_type, city, province, country, tier)')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ row: data });
  }

  // DELETE — remove an order
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
