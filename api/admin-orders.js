import { requireAdminOrOrderToken } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { advanceOrderStatusToTarget, normalizeOrderStatus } from './_order-status.js';
import {
  CUSTOMER_SEND_FORBIDDEN,
  isVictorSender,
  PAYMENT_RECEIVED_FORBIDDEN,
} from './_fulfillment-auth.js';
import { getPortalAdminClient, SITE_CONFIG_BUCKET } from './_site-config.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const ORDER_SELECT = '*, customers(name, contact_name, email, phone, business_name, business_type, city, province, country, company_address, delivery_address, vat_number, customer_code, tier)';

function assertOrderScope(auth, orderId, res) {
  if (auth.type === 'admin') return true;
  if (String(orderId) === String(auth.orderId)) return true;
  res.status(403).json({ error: 'Not authorized for this order' });
  return false;
}

function safeSearchTerm(search) {
  return String(search || '').replace(/[%',()\\]/g, ' ').trim();
}

async function listConfirmationSentIds() {
  const supabase = getPortalAdminClient();
  const sent = new Set();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(SITE_CONFIG_BUCKET)
      .list('orders/confirmation', { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const file of data) {
      if (file.name?.endsWith('.json')) sent.add(file.name.replace(/\.json$/, ''));
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return sent;
}

function orderMatchesTab(order, tab, confirmationSentIds) {
  const key = normalizeOrderStatus(order?.status);
  const sent = confirmationSentIds.has(String(order?.id));
  if (tab === 'new') return key === 'pending';
  if (tab === 'handed') return key === 'handed over';
  if (tab === 'progress') return key === 'order in progress';
  if (tab === 'sent') return key === 'order sent' && !sent;
  if (tab === 'paid') return key === 'payment received' || (key === 'order sent' && sent);
  return true;
}

async function resolveCustomerIdsForSearch(supabase, term) {
  const safe = safeSearchTerm(term);
  if (!safe) return [];
  const { data } = await supabase
    .from('customers')
    .select('id')
    .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,business_name.ilike.%${safe}%,contact_name.ilike.%${safe}%`);
  return (data || []).map((r) => r.id).filter(Boolean);
}

function applyOrderSearch(query, term, customerIds) {
  const safe = safeSearchTerm(term);
  if (!safe) return query;
  const parts = [
    `order_number.ilike.%${safe}%`,
    `items::text.ilike.%${safe}%`,
    `original_items::text.ilike.%${safe}%`,
  ];
  for (const id of customerIds) parts.push(`customer_id.eq.${id}`);
  return query.or(parts.join(','));
}

async function computeTabCounts(supabase, confirmationSentIds) {
  const { data, error } = await supabase.from('orders').select('id, status');
  if (error) throw error;
  const counts = { all: 0, new: 0, handed: 0, progress: 0, sent: 0, paid: 0 };
  for (const order of data || []) {
    counts.all += 1;
    for (const tab of ['new', 'handed', 'progress', 'sent', 'paid']) {
      if (orderMatchesTab(order, tab, confirmationSentIds)) counts[tab] += 1;
    }
  }
  return counts;
}

async function fetchAdminOrdersPage(supabase, {
  page, pageSize, search, tab, confirmationSentIds,
}) {
  const term = safeSearchTerm(search);
  const customerIds = term ? await resolveCustomerIdsForSearch(supabase, term) : [];

  if (tab === 'sent' || tab === 'paid') {
    let q = supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false });
    q = applyOrderSearch(q, term, customerIds);
    const { data, error } = await q;
    if (error) throw error;
    const filtered = (data || []).filter((o) => orderMatchesTab(o, tab, confirmationSentIds));
    const total = filtered.length;
    const from = (page - 1) * pageSize;
    return {
      rows: filtered.slice(from, from + pageSize),
      total,
      page,
      pageSize,
    };
  }

  let q = supabase.from('orders').select(ORDER_SELECT, { count: 'exact' }).order('created_at', { ascending: false });
  q = applyOrderSearch(q, term, customerIds);
  if (tab === 'new') q = q.eq('status', 'pending');
  else if (tab === 'handed') q = q.eq('status', 'handed over');
  else if (tab === 'progress') q = q.eq('status', 'order in progress');

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  q = q.range(from, to);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

export default async function handler(req, res) {
  const auth = await requireAdminOrOrderToken(req, res);
  if (!auth) return;
  const supabase = getAdminClient();

  if (req.method === 'GET') {
    const {
      limit = '',
      customerId = '',
      id = '',
      page = '1',
      pageSize = '50',
      search = '',
      tab = 'all',
    } = req.query;

    if (auth.type === 'order') {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', auth.orderId)
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ rows: data ? [data] : [] });
    }

    if (id) {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ rows: data ? [data] : [] });
    }

    if (customerId) {
      const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(lim);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ rows: data || [] });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const tabKey = String(tab || 'all').trim();
    const confirmationSentIds = await listConfirmationSentIds();

    try {
      const tabCounts = await computeTabCounts(supabase, confirmationSentIds);
      if (tabKey === 'all' && !search) {
        const from = (pageNum - 1) * size;
        const to = from + size - 1;
        const { data, error, count } = await supabase
          .from('orders')
          .select(ORDER_SELECT, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({
          rows: data || [],
          total: count || 0,
          page: pageNum,
          pageSize: size,
          tabCounts,
        });
      }

      const result = await fetchAdminOrdersPage(supabase, {
        page: pageNum,
        pageSize: size,
        search,
        tab: tabKey,
        confirmationSentIds,
      });
      return res.status(200).json({ ...result, tabCounts });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const { id, notes, advanceWorkflow, senderUserId, senderName, ...raw } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    if (!assertOrderScope(auth, id, res)) return;

    const patch = { ...raw };
    if (notes !== undefined) patch.order_change_notes = notes;

    // Legacy timestamp shims — remove after direct status PATCH is fully retired
    if (patch.status === 'viewed' && !patch.viewed_at) patch.viewed_at = new Date().toISOString();
    if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
    if (patch.status === 'delivered' && !patch.delivered_at) patch.delivered_at = new Date().toISOString();

    const allowed = new Set([
      'final_items', 'original_items', 'order_change_notes', 'order_match',
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
      .select(ORDER_SELECT)
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
