import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const supabase = getAdminClient();

  const rows = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, business_name, business_type, accept_whatsapp, is_approved, tier, created_at')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) return res.status(400).json({ error: error.message });
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return res.status(200).json({ customers: rows });
}
