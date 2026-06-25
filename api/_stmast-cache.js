import { createClient } from '@supabase/supabase-js';

function getCacheClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function fetchFromCache(code) {
  const sb = getCacheClient();
  const { data } = await sb
    .from('stmast_cache')
    .select('code, descr, price_a, onhand, booked, dept')
    .eq('code', code)
    .maybeSingle();
  if (!data) return null;
  const onhand = Number(data.onhand) || 0;
  const booked = Number(data.booked) || 0;
  return {
    code:      String(data.code || '').trim(),
    title:     String(data.descr ?? '').trim(),
    price:     Number(data.price_a) || 0,
    onhand,
    booked,
    available: onhand - booked,
    dept:      data.dept || '',
  };
}
