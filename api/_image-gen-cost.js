import { createClient } from '@supabase/supabase-js';

const USD_TO_ZAR_FALLBACK = 18.0;

/** Approximate OpenRouter pricing — image models often bill per call + tokens. */
const MODEL_PRICING = {
  'google/gemini-3-pro-image-preview': { inPerM: 0.10, outPerM: 0.40, imagePerCall: 0.06 },
  'google/gemini-2.5-flash-image': { inPerM: 0.075, outPerM: 0.30, imagePerCall: 0.025 },
  'google/gemini-2.5-flash': { inPerM: 0.075, outPerM: 0.30, imagePerCall: 0 },
  'google/gemini-flash-1.5': { inPerM: 0.075, outPerM: 0.30, imagePerCall: 0 },
};

let cachedFxRate = null;
let cachedFxAt = 0;

export function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function fetchUsdToZarRate() {
  const now = Date.now();
  if (cachedFxRate && (now - cachedFxAt) < 6 * 60 * 60 * 1000) return cachedFxRate;
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=ZAR');
    if (!response.ok) throw new Error(`FX ${response.status}`);
    const payload = await response.json();
    const rate = Number(payload?.rates?.ZAR);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid ZAR rate');
    cachedFxRate = rate;
    cachedFxAt = now;
    return rate;
  } catch {
    return cachedFxRate || USD_TO_ZAR_FALLBACK;
  }
}

export function estimateImageGenCost({ model = '', tokensIn = 0, tokensOut = 0, isImageOutput = false } = {}) {
  const key = String(model || '').trim();
  const pricing = MODEL_PRICING[key] || { inPerM: 0.10, outPerM: 0.40, imagePerCall: isImageOutput ? 0.04 : 0 };
  const tokenCost = ((tokensIn / 1e6) * pricing.inPerM) + ((tokensOut / 1e6) * pricing.outPerM);
  const imageCost = isImageOutput ? (pricing.imagePerCall || 0) : 0;
  return parseFloat((tokenCost + imageCost).toFixed(6));
}

export function extractImageGenMeta(req) {
  return {
    operator: String(req.headers['x-image-gen-operator'] || req.body?.operator || 'Unknown').trim().slice(0, 64) || 'Unknown',
    batchId: String(req.headers['x-image-gen-batch-id'] || req.body?.batchId || '').trim().slice(0, 64) || null,
  };
}

export async function logImageGenCost(sb, entry) {
  try {
    const usdToZar = entry.usdToZar ?? await fetchUsdToZarRate();
    const costUsd = Number(entry.costUsd ?? entry.cost_usd ?? 0);
    const costZar = Number(entry.costZar ?? entry.cost_zar ?? (costUsd * usdToZar).toFixed(4));
    const row = {
      sku: entry.sku || null,
      slot: entry.slot ?? null,
      operation: entry.operation || 'transform',
      model: entry.model || null,
      image_style: entry.imageStyle || entry.image_style || null,
      tokens_in: Number(entry.tokensIn ?? entry.tokens_in ?? 0),
      tokens_out: Number(entry.tokensOut ?? entry.tokens_out ?? 0),
      cost_usd: costUsd,
      cost_zar: costZar,
      processing_ms: entry.processingMs ?? entry.processing_ms ?? null,
      operator: entry.operator || null,
      batch_id: entry.batchId || entry.batch_id || null,
      status: entry.status || 'ok',
      error: entry.error || null,
    };
    const { error } = await sb.from('image_gen_cost_logs').insert(row);
    if (error && !/does not exist|relation/i.test(error.message)) {
      console.warn('logImageGenCost:', error.message);
    }
    return { costUsd, costZar, usdToZar };
  } catch (err) {
    console.warn('logImageGenCost failed:', err?.message || err);
    const costUsd = Number(entry.costUsd ?? 0);
    const usdToZar = entry.usdToZar ?? USD_TO_ZAR_FALLBACK;
    return { costUsd, costZar: costUsd * usdToZar, usdToZar };
  }
}

export async function purgeExpiredLocks(sb) {
  try {
    await sb.from('image_gen_locks').delete().lt('expires_at', new Date().toISOString());
  } catch { /* table may not exist yet */ }
}

export async function acquireImageGenLock(sb, { sku, slot, batchId, operator, ttlSec = 420 } = {}) {
  await purgeExpiredLocks(sb);
  const cleanSku = String(sku || '').trim();
  const cleanSlot = Math.min(4, Math.max(1, Number(slot) || 1));
  if (!cleanSku) throw new Error('Missing SKU for lock');

  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  const { error } = await sb.from('image_gen_locks').insert({
    sku: cleanSku,
    slot: cleanSlot,
    batch_id: batchId || null,
    operator: operator || null,
    expires_at: expiresAt,
  });

  if (error) {
    if (/does not exist|relation/i.test(error.message)) return { locked: false, skipped: true };
    if (error.code === '23505') {
      const { data: existing } = await sb
        .from('image_gen_locks')
        .select('operator, batch_id, expires_at')
        .eq('sku', cleanSku)
        .eq('slot', cleanSlot)
        .maybeSingle();
      const who = existing?.operator || 'another user';
      throw new Error(`"${cleanSku}" slot ${cleanSlot} is in use by ${who}. Wait for their batch to finish or try again shortly.`);
    }
    throw new Error(error.message);
  }
  return { locked: true, sku: cleanSku, slot: cleanSlot };
}

export async function releaseImageGenLock(sb, sku, slot) {
  try {
    const cleanSku = String(sku || '').trim();
    const cleanSlot = Math.min(4, Math.max(1, Number(slot) || 1));
    await sb.from('image_gen_locks').delete().eq('sku', cleanSku).eq('slot', cleanSlot);
  } catch { /* ignore */ }
}

export async function registerImageGenBatch(sb, { batchId, operator, total, style, productCount } = {}) {
  if (!batchId) return;
  try {
    await sb.from('image_gen_batches').upsert({
      id: batchId,
      operator: operator || null,
      status: 'running',
      total: Number(total) || 0,
      done: 0,
      failed: 0,
      style: style || null,
      product_count: Number(productCount) || 0,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('registerImageGenBatch:', err?.message || err);
  }
}

export async function updateImageGenBatch(sb, batchId, patch = {}) {
  if (!batchId) return;
  try {
    const row = { updated_at: new Date().toISOString(), ...patch };
    if (patch.status === 'complete' || patch.status === 'cancelled') {
      row.finished_at = new Date().toISOString();
    }
    await sb.from('image_gen_batches').update(row).eq('id', batchId);
  } catch { /* ignore */ }
}

export async function listImageGenCosts(sb, { days = 30, limit = 200 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs, error } = await sb
    .from('image_gen_cost_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 500));
  if (error) throw error;
  return logs || [];
}

export async function listActiveImageGenState(sb) {
  await purgeExpiredLocks(sb);
  const [locksRes, batchesRes] = await Promise.all([
    sb.from('image_gen_locks').select('*').order('locked_at', { ascending: false }),
    sb.from('image_gen_batches').select('*').eq('status', 'running').order('updated_at', { ascending: false }),
  ]);
  return {
    locks: locksRes.data || [],
    batches: batchesRes.data || [],
  };
}

export function summarizeCosts(logs = []) {
  const totals = { usd: 0, zar: 0, count: 0, errors: 0 };
  const byDay = new Map();
  const byOperator = new Map();
  const byOperation = new Map();

  for (const row of logs) {
    const usd = Number(row.cost_usd) || 0;
    const zar = Number(row.cost_zar) || 0;
    totals.usd += usd;
    totals.zar += zar;
    totals.count += 1;
    if (row.status === 'error') totals.errors += 1;

    const day = String(row.created_at || '').slice(0, 10);
    if (day) {
      const d = byDay.get(day) || { usd: 0, zar: 0, count: 0 };
      d.usd += usd;
      d.zar += zar;
      d.count += 1;
      byDay.set(day, d);
    }

    const op = row.operator || 'Unknown';
    const o = byOperator.get(op) || { usd: 0, zar: 0, count: 0 };
    o.usd += usd;
    o.zar += zar;
    o.count += 1;
    byOperator.set(op, o);

    const kind = row.operation || 'other';
    const k = byOperation.get(kind) || { usd: 0, zar: 0, count: 0 };
    k.usd += usd;
    k.zar += zar;
    k.count += 1;
    byOperation.set(kind, k);
  }

  return {
    totals,
    byDay: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, v]) => ({ day, ...v })),
    byOperator: [...byOperator.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([operator, v]) => ({ operator, ...v })),
    byOperation: [...byOperation.entries()].sort((a, b) => b[1].usd - a[1].usd).map(([operation, v]) => ({ operation, ...v })),
  };
}
