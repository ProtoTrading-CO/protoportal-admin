import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Paginated read + inline edit of proto active customer allowlist. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;

  if (req.method === 'PATCH') {
    const { id, contact_name, first_name, name, email, account_code, sales_last_12_months, invoice_count, last_purchase_date } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const patch = {};
    if (contact_name !== undefined) patch.contact_name = String(contact_name).trim() || null;
    if (first_name !== undefined) patch.first_name = String(first_name).trim() || null;
    if (name !== undefined) patch.name = String(name).trim() || null;
    if (email !== undefined) {
      const e = String(email).trim().toLowerCase();
      if (!e || !e.includes('@')) return res.status(400).json({ error: 'Valid email required' });
      patch.email = e;
    }
    if (account_code !== undefined) patch.account_code = String(account_code).trim().toUpperCase() || null;
    if (sales_last_12_months !== undefined) patch.sales_last_12_months = Number(sales_last_12_months) || 0;
    if (invoice_count !== undefined) patch.invoice_count = Math.max(0, parseInt(invoice_count, 10) || 0);
    if (last_purchase_date !== undefined) patch.last_purchase_date = last_purchase_date || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No fields to update' });

    try {
      const sb = getAdminClient();
      const { data, error } = await sb
        .from('proto_active_customers')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, row: data });
    } catch (err) {
      console.error('proto-active-customers PATCH:', err?.message || err);
      return res.status(500).json({ error: err.message || 'Update failed' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      const sb = getAdminClient();
      const { error } = await sb.from('proto_active_customers').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('proto-active-customers DELETE:', err?.message || err);
      return res.status(500).json({ error: err.message || 'Delete failed' });
    }
  }

  if (req.method !== 'GET') return res.status(405).end();

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const search = String(req.query.search || '').trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const sb = getAdminClient();
    let q = sb
      .from('proto_active_customers')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    if (search) {
      const safe = search.replace(/[%',()]/g, ' ').trim();
      if (safe) {
        q = q.or(`email.ilike.%${safe}%,name.ilike.%${safe}%,account_code.ilike.%${safe}%,contact_name.ilike.%${safe}%,first_name.ilike.%${safe}%`);
      }
    }

    const { data, error, count } = await q;
    if (error) {
      if (/proto_active_customers/.test(error.message)) {
        return res.status(200).json({
          rows: [],
          total: 0,
          page,
          pageSize,
          migrationRequired: true,
          message: 'Run migration 021_proto_active_customers.sql, then seed the allowlist.',
        });
      }
      throw error;
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      rows: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('proto-active-customers:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Failed to load proto active customers' });
  }
}
