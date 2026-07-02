import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { parseCustomerTab, parsePositiveInt, parseBusinessTypeFilter } from './_admin-query-params.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  const supabase = getAdminClient();

  // GET — list customers by tab
  if (req.method === 'GET') {
    const { tab = 'requests', page = '1', pageSize = '50', search = '', business_type: businessType = '' } = req.query;
    let pageNum;
    let size;
    let tabKey;
    let bt;
    try {
      pageNum = parsePositiveInt(page, { name: 'page', min: 1, max: 10_000, fallback: 1 });
      size = parsePositiveInt(pageSize, { name: 'pageSize', min: 1, max: 200, fallback: 50 });
      tabKey = parseCustomerTab(tab);
      bt = parseBusinessTypeFilter(businessType);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tabKey === 'premium') {
      query = query.eq('tier', 'premium').eq('is_approved', true);
    } else if (tabKey === 'requests') {
      query = query.eq('is_approved', false);
    } else if (tabKey === 'regular') {
      query = query.eq('is_approved', true);
    }

    if (bt === '__unspecified__') {
      query = query.or('business_type.is.null,business_type.eq.');
    } else if (bt) {
      query = query.eq('business_type', bt);
    }

    const q = (search || '').trim();
    if (q) {
      const safe = q.replace(/[%',()]/g, ' ').trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,business_name.ilike.%${safe}%,first_name.ilike.%${safe}%,contact_name.ilike.%${safe}%,customer_code.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const rows = data || [];

    // Count orders per customer server-side — avoids a slow round-trip from the browser
    let orderCounts = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id).filter(Boolean);
      const { data: orderRows } = await supabase
        .from('orders')
        .select('customer_id')
        .in('customer_id', ids);
      (orderRows || []).forEach((r) => {
        if (!r.customer_id) return;
        orderCounts[r.customer_id] = (orderCounts[r.customer_id] || 0) + 1;
      });
    }

    return res.status(200).json({
      rows: rows.map((r) => ({ ...r, orderCount: orderCounts[r.id] || 0 })),
      total: count || 0,
      page: pageNum,
      pageSize: size,
    });
  }

  // PATCH — approve / update customer fields (allowlisted columns only)
  if (req.method === 'PATCH') {
    const ALLOWED_PATCH_FIELDS = new Set([
      'is_approved', 'tier', 'name', 'email', 'phone', 'business_name',
      'business_type', 'company_address', 'delivery_address', 'vat_number',
      'monthly_spend', 'website',
      'country', 'province', 'city', 'accept_whatsapp', 'customer_code',
      'sales_last_12_months', 'invoice_count', 'last_purchase_date',
      'contact_name', 'first_name',
    ]);
    const { id, ...rawPatch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch = Object.fromEntries(
      Object.entries(rawPatch).filter(([key]) => ALLOWED_PATCH_FIELDS.has(key)),
    );
    if (patch.customer_code !== undefined) {
      const code = String(patch.customer_code || '').trim().toUpperCase();
      if (code && !/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Customer code must be exactly 6 letters or numbers' });
      }
      patch.customer_code = code || null;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields to update' });

    if (patch.is_approved === true) {
      const { data: existing } = await supabase
        .from('customers')
        .select('customer_code')
        .eq('id', id)
        .maybeSingle();
      const code = patch.customer_code || existing?.customer_code;
      if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'A 6-character customer code is required before approval' });
      }
      if (!patch.customer_code) patch.customer_code = code;
    }
    const { data, error } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return res.status(400).json({ error: error.message });

    // Send WhatsApp welcome via WATI on approval — skip only if customer explicitly opted out
    let watiWelcome = 'skipped';
    if (patch.is_approved === true && data?.accept_whatsapp !== false && data?.phone) {
      const rawPhone = data.phone.replace(/\D/g, '');
      // WATI expects numbers without + in international format: 27821234567
      const watiPhone = rawPhone.startsWith('0') ? `27${rawPhone.slice(1)}` : rawPhone;
      const watiBase = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950';
      const watiToken = process.env.WATI_API_TOKEN;
      const welcomeTemplate = process.env.WATI_WELCOME_TEMPLATE || 'proto_welcome_';
      if (watiToken) {
        try {
          // Step 1: Add/update contact in WATI so the number is registered
          await fetch(`${watiBase}/api/v1/addContact`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: data.name || data.business_name || 'Customer',
              phoneNumber: watiPhone,
            }),
          }).catch(() => {}); // non-fatal if contact already exists

          // Step 2: Send the template message
          const waRes = await fetch(
            `${watiBase}/api/v1/sendTemplateMessage?whatsappNumber=${watiPhone}`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                template_name: welcomeTemplate,
                broadcast_name: welcomeTemplate,
                parameters: [],
              }),
            }
          );
          if (!waRes.ok) {
            const waBody = await waRes.json().catch(() => ({}));
            console.error('WATI send error:', waRes.status, JSON.stringify(waBody));
            watiWelcome = 'failed';
          } else {
            watiWelcome = 'sent';
          }
        } catch (waErr) {
          console.error('WATI broadcast error:', waErr.message);
          watiWelcome = 'failed';
        }
      }
    }

    return res.status(200).json({ row: data, watiWelcome });
  }

  // DELETE — remove customer
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const { count: orderCount, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id);
    if (countError) return res.status(400).json({ error: countError.message });

    const { error: custError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    if (custError) return res.status(400).json({ error: custError.message });

    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      return res.status(400).json({ error: authError.message || 'Failed to delete auth user' });
    }

    return res.status(200).json({ ok: true, orderCount: orderCount || 0 });
  }

  return res.status(405).end();
}
