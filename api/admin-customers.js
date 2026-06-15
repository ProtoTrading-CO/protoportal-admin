import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  const supabase = getAdminClient();

  // GET — list customers by tab
  if (req.method === 'GET') {
    const { tab = 'requests', page = '1', pageSize = '50', search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tab === 'premium') {
      query = query.eq('tier', 'premium').eq('is_approved', true);
    } else if (tab === 'requests') {
      query = query.eq('is_approved', false);
    } else if (tab === 'regular') {
      query = query.eq('is_approved', true);
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
    if (patch.is_approved === true && data?.accept_whatsapp !== false && data?.phone) {
      const rawPhone = data.phone.replace(/\D/g, '');
      // WATI expects numbers without + in international format: 27821234567
      const watiPhone = rawPhone.startsWith('0') ? `27${rawPhone.slice(1)}` : rawPhone;
      const watiBase = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950';
      const watiToken = process.env.WATI_API_TOKEN;
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
                template_name: 'proto_welcome_',
                broadcast_name: 'proto_welcome_',
                parameters: [],
              }),
            }
          );
          if (!waRes.ok) {
            const waBody = await waRes.json().catch(() => ({}));
            console.error('WATI send error:', waRes.status, JSON.stringify(waBody));
          }
        } catch (waErr) {
          console.error('WATI broadcast error:', waErr.message);
        }
      }
    }

    return res.status(200).json({ row: data });
  }

  // DELETE — remove customer
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    // Delete from customers table first
    const { error: custError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    if (custError) return res.status(400).json({ error: custError.message });

    // Also delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) console.error('auth.admin.deleteUser error:', authError.message);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
