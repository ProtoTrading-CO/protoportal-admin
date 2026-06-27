import { requireCronOrAdminKey } from './_admin-auth.js';
import { websitePriceFromSellPrice } from './_pricing.js';
import { getStockClient } from './_stock-client.js';

function hasDecimalCents(price) {
  const n = Number(price);
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) > 0.001;
}

/** Batched VAT backfill — call repeatedly until remaining hits 0. */
export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  if (req.method !== 'POST') return res.status(405).end();

  const limit = Math.min(Number(req.body?.limit) || 300, 500);
  const pass = String(req.body?.pass || 'decimal');

  try {
    const sb = getStockClient();
    let updated = 0;

    if (pass === 'decimal') {
      const { data, error } = await sb
        .from('website_stock')
        .select('sku, price')
        .not('price', 'is', null)
        .gt('price', 0)
        .limit(2000);
      if (error) throw error;

      const targets = (data || []).filter((r) => hasDecimalCents(r.price)).slice(0, limit);
      for (const row of targets) {
        const next = websitePriceFromSellPrice(row.price);
        if (!next || next === Number(row.price)) continue;
        const { error: upErr } = await sb
          .from('website_stock')
          .update({ price: next, updated_at: new Date().toISOString() })
          .eq('sku', row.sku);
        if (upErr) throw upErr;
        updated += 1;
      }

      const remaining = (data || []).filter((r) => hasDecimalCents(r.price)).length - targets.length;
      return res.status(200).json({ ok: true, pass: 'decimal', updated, remaining: Math.max(0, remaining) });
    }

    return res.status(400).json({ error: 'Unknown pass' });
  } catch (err) {
    console.error('backfill-vat-prices:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
