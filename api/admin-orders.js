import { requireAdminOrOrderToken } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { advanceOrderStatusToTarget, normalizeOrderStatus } from './_order-status.js';
import {
  CUSTOMER_SEND_FORBIDDEN,
  isVictorSender,
  PAYMENT_RECEIVED_FORBIDDEN,
} from './_fulfillment-auth.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function assertOrderScope(auth, orderId, res) {
  if (auth.type === 'admin') return true;
  if (String(orderId) === String(auth.orderId)) return true;
  res.status(403).json({ error: 'Not authorized for this order' });
  return false;
}

export default async function handler(req, res) {
  const auth = await requireAdminOrOrderToken(req, res);
  if (!auth) return;
  const supabase = getAdminClient();

  if (req.method === 'GET') {
    const { limit = '150', customerId = '', id = '' } = req.query;
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 150));

    if (auth.type === 'order') {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name, contact_name, email, phone, business_name, business_type, city, province, country, company_address, delivery_address, vat_number, customer_code, tier)')
        .eq('id', auth.orderId)
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ rows: data ? [data] : [] });
    }

    let ordersQuery = supabase
      .from('orders')
      .select('*, customers(name, contact_name, email, phone, business_name, business_type, city, province, country, company_address, delivery_address, vat_number, customer_code, tier)')
      .order('created_at', { ascending: false })
      .limit(lim);

    if (id) ordersQuery = ordersQuery.eq('id', id);
    if (customerId) ordersQuery = ordersQuery.eq('customer_id', customerId);

    const { data, error } = await ordersQuery;
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  }

  if (req.method === 'PATCH') {
    const { id, notes, advanceWorkflow, senderUserId, senderName, ...raw } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (!assertOrderScope(auth, id, res)) return;

    const patch = { ...raw };
    if (notes !== undefined) patch.order_change_notes = notes;

    if (patch.status === 'viewed' && !patch.viewed_at) patch.viewed_at = new Date().toISOString();
    if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
    if (patch.status === 'delivered' && !patch.delivered_at) patch.delivered_at = new Date().toISOString();

    const allowed = new Set([
      'status', 'final_items', 'original_items', 'order_change_notes', 'order_match',
      'replacement_map', 'viewed_at', 'paid_at', 'delivered_at', 'total_ex_vat',
      'handed_over_at', 'order_in_progress_at', 'order_sent_at', 'payment_received_at',
      'delivery_method',
    ]);
    const sanitized = {};
    for (const [key, value] of Object.entries(patch)) {
      if (allowed.has(key)) sanitized[key] = value;
    }

    if (Object.keys(sanitized).length) {
      const { error: patchError } = await supabase.from('orders').update(sanitized).eq('id', id);
      if (patchError) return res.status(400).json({ error: patchError.message });
    }

    if (advanceWorkflow) {
      const target = normalizeOrderStatus(advanceWorkflow);
      const allowedTargets = new Set(['handed over', 'order in progress', 'order sent', 'payment received']);
      if (!allowedTargets.has(target)) {
        return res.status(400).json({ error: `Unsupported workflow target: "${target}"` });
      }
      if ((target === 'order sent' || target === 'payment received')
        && !isVictorSender({ userId: senderUserId, name: senderName })) {
        return res.status(403).json({
          error: target === 'payment received' ? PAYMENT_RECEIVED_FORBIDDEN : CUSTOMER_SEND_FORBIDDEN,
        });
      }
      try {
        const result = await advanceOrderStatusToTarget(supabase, id, target);
        if (!result.ok) {
          return res.status(409).json({
            error: `Cannot advance to "${target}" from "${result.current || 'unknown'}"`,
            reason: result.reason,
          });
        }
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name, contact_name, email, phone, business_name, business_type, city, province, country, company_address, delivery_address, vat_number, customer_code, tier)')
      .eq('id', id)
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ row: data });
  }

  if (req.method === 'DELETE') {
    if (auth.type !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
