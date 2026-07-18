import { requireOwner } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { applyDormantToLive } from './_stage-dormant.js';

function getClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  if (!(await requireOwner(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku } = req.body || {};
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  try {
    const result = await applyDormantToLive(getClient(), cleanSku);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('apply-dormant-live:', err?.message || err);
    return res.status(400).json({ error: err.message || 'Go live failed' });
  }
}
