import { createClient } from '@supabase/supabase-js';
import { allocateCustomerCode, sendWelcomeWhatsapp } from './_customer-onboard.js';
import { requireCronOrAdminKey } from './_admin-auth.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getAdminClient();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: pending, error } = await supabase
    .from('customers')
    .select('id, email, name, phone, business_name, company_address, delivery_address, customer_code, accept_whatsapp, is_approved, role, created_at')
    .eq('is_approved', false)
    .eq('role', 'customer')
    .gte('created_at', since)
    .not('company_address', 'is', null)
    .not('delivery_address', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const approved = [];
  for (const row of pending || []) {
    const companyAddress = String(row.company_address || '').trim();
    const deliveryAddress = String(row.delivery_address || '').trim();
    if (!companyAddress || !deliveryAddress) continue;

    let customerCode = row.customer_code;
    if (!customerCode) {
      try {
        customerCode = await allocateCustomerCode(supabase, null);
      } catch (err) {
        console.error('auto-approve code allocation failed:', row.email, err?.message || err);
        continue;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({ is_approved: true, customer_code: customerCode })
      .eq('id', row.id)
      .eq('is_approved', false)
      .select('*')
      .maybeSingle();

    if (updateError || !updated) {
      if (updateError) console.error('auto-approve update failed:', row.email, updateError.message);
      continue;
    }

    await sendWelcomeWhatsapp(updated);
    approved.push({ id: updated.id, email: updated.email, customerCode });
  }

  return res.status(200).json({
    ok: true,
    scanned: pending?.length || 0,
    approved: approved.length,
    customers: approved,
  });
}
