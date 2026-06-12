import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

const VALID_PERIODS = [7, 30, 90, 0];

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function parsePeriod(raw) {
  const n = parseInt(raw, 10);
  return VALID_PERIODS.includes(n) ? n : 30;
}

function startDateFromPeriod(periodDays) {
  if (!periodDays) return null;
  const d = new Date();
  d.setDate(d.getDate() - periodDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function withStart(q, startDate) {
  return startDate ? q.gte('created_at', startDate) : q;
}

function firstError(results) {
  for (const r of results) {
    if (r?.error) return r.error;
  }
  return null;
}

async function syncActionQueue(supabase, startDate) {
  try {
    const [{ data: zeroResults }, { data: zeroOrders }] = await Promise.all([
      supabase.rpc('rpc_zero_result_terms', { p_start: startDate, p_limit: 200 }),
      supabase.rpc('rpc_zero_order_terms', { p_start: startDate, p_limit: 200 }),
    ]);

    const tasks = [];
    for (const row of zeroResults || []) {
      if (Number(row.search_count) >= 10) {
        tasks.push({ search_term: row.normalized_search_term, flag_reason: 'zero_results', search_count: Number(row.search_count) });
      }
    }
    for (const row of zeroOrders || []) {
      if (Number(row.searches) >= 20) {
        tasks.push({ search_term: row.normalized_search_term, flag_reason: 'zero_sales', search_count: Number(row.searches) });
      }
    }

    for (const task of tasks) {
      const { data: existing } = await supabase
        .from('search_action_queue')
        .select('id, status')
        .eq('search_term', task.search_term)
        .eq('flag_reason', task.flag_reason)
        .maybeSingle();

      if (!existing) {
        await supabase.from('search_action_queue').insert({
          search_term: task.search_term,
          flag_reason: task.flag_reason,
          search_count: task.search_count,
          status: 'open',
        });
      } else if (existing.status === 'open') {
        await supabase
          .from('search_action_queue')
          .update({ search_count: task.search_count })
          .eq('id', existing.id);
      }
    }
  } catch (err) {
    console.error('syncActionQueue:', err?.message || err);
  }
}

async function loadDashboard(supabase, startDate, showAllQueue = false) {
  const totalRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  );
  const uniqueRes = await withStart(
    supabase.from('search_analytics').select('normalized_search_term'),
    startDate,
  );
  const withResultsRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  ).gt('results_found', 0);
  const noResultsRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  ).eq('results_found', 0);
  const ordersRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  ).eq('order_created', true);
  const revenueRes = await withStart(
    supabase.from('search_analytics').select('order_value'),
    startDate,
  ).eq('order_created', true);
  const funnelClicksRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  ).not('search_position_clicked', 'is', null);
  const funnelCartRes = await withStart(
    supabase.from('search_analytics').select('id', { count: 'exact', head: true }),
    startDate,
  ).eq('added_to_cart', true);
  const historyRes = await withStart(
    supabase.from('search_analytics').select('customer_email, search_term, created_at, results_found, normalized_search_term')
      .not('customer_email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    startDate,
  );
  const latestRes = await supabase
    .from('search_analytics')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    volumeRes,
    topRes,
    zeroRes,
    ordersTermsRes,
    zeroOrderRes,
    clickPosRes,
    actionQueueRes,
  ] = await Promise.all([
    supabase.rpc('rpc_search_volume_by_day', { p_start: startDate }),
    supabase.rpc('rpc_top_searches', { p_start: startDate, p_limit: 20 }),
    supabase.rpc('rpc_zero_result_terms', { p_start: startDate, p_limit: 50 }),
    supabase.rpc('rpc_searches_to_orders', { p_start: startDate, p_limit: 30 }),
    supabase.rpc('rpc_zero_order_terms', { p_start: startDate, p_limit: 30 }),
    supabase.rpc('rpc_avg_click_position', { p_start: startDate, p_limit: 10 }),
    showAllQueue
      ? supabase
        .from('search_action_queue')
        .select('id, search_term, flag_reason, search_count, status, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(200)
      : supabase
        .from('search_action_queue')
        .select('id, search_term, flag_reason, search_count, status, created_at, resolved_at')
        .eq('status', 'open')
        .order('search_count', { ascending: false })
        .limit(100),
  ]);

  const tableError = firstError([
    totalRes, uniqueRes, withResultsRes, noResultsRes, ordersRes, revenueRes,
    funnelClicksRes, funnelCartRes, historyRes, latestRes,
    volumeRes, topRes, zeroRes, ordersTermsRes, zeroOrderRes, clickPosRes, actionQueueRes,
  ]);

  const trackingEnabled = !tableError || tableError.code !== '42P01';
  const totalSearches = totalRes.count || 0;
  const uniqueTerms = new Set((uniqueRes.data || []).map((r) => r.normalized_search_term)).size;
  const searchesWithResults = withResultsRes.count || 0;
  const searchesNoResults = noResultsRes.count || 0;
  const searchesToOrders = ordersRes.count || 0;
  const conversionPct = totalSearches
    ? Number(((searchesToOrders / totalSearches) * 100).toFixed(1))
    : 0;
  const revenue = (revenueRes.data || []).reduce((sum, r) => sum + Number(r.order_value || 0), 0);

  const volumeByDay = (volumeRes.data || []).map((row) => ({
    date: row.day,
    label: new Date(row.day).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
    searches: Number(row.search_count),
  }));

  return {
    meta: {
      trackingEnabled,
      lastSearchAt: latestRes.data?.created_at || null,
      tableError: tableError ? tableError.message : null,
    },
    kpis: {
      totalSearches,
      uniqueTerms,
      searchesWithResults,
      searchesNoResults,
      searchesToOrders,
      conversionPct,
      revenue,
    },
    funnel: {
      total: totalSearches,
      clicks: funnelClicksRes.count || 0,
      cart: funnelCartRes.count || 0,
      orders: searchesToOrders,
    },
    volumeByDay,
    topSearches: topRes.data || [],
    zeroResultTerms: zeroRes.data || [],
    searchesToOrders: ordersTermsRes.data || [],
    zeroOrderTerms: zeroOrderRes.data || [],
    avgClickPosition: clickPosRes.data || [],
    customerHistory: historyRes.data || [],
    wantedNotFound: (zeroRes.data || []).slice(0, 30),
    actionQueue: actionQueueRes.data || [],
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    if (!requireAdminKey(req, res)) return;

    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Supabase env not configured on this deployment' });
    }

    const period = parsePeriod(req.query?.period);
    const startDate = startDateFromPeriod(period);
    const showAllQueue = req.query?.showAllQueue === '1';
    const supabase = getAdminClient();

    try {
      await syncActionQueue(supabase, startDate);
      const data = await loadDashboard(supabase, startDate, showAllQueue);
      if (data.meta.tableError && !data.meta.trackingEnabled) {
        return res.status(503).json({ error: 'Search analytics tables not found — run migration 019 on the main Supabase project.' });
      }
      return res.status(200).json({ period, ...data });
    } catch (err) {
      console.error('search-analytics-dashboard GET:', err?.message || err);
      return res.status(500).json({ error: 'Failed to load search analytics' });
    }
  }

  if (req.method === 'PATCH') {
    if (!requireAdminKey(req, res)) return;

    const { id, status } = req.body || {};
    if (!id || !['actioned', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'id and status (actioned|dismissed) required' });
    }

    const supabase = getAdminClient();
    const { error } = await supabase
      .from('search_action_queue')
      .update({ status, resolved_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('search-analytics-dashboard PATCH:', error.message);
      return res.status(500).json({ error: 'Update failed' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
