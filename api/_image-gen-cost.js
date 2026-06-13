import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';

const USD_TO_ZAR_FALLBACK = 18.0;
const COSTS_FILE = 'image-gen/cost-logs.json';
const LOCKS_FILE = 'image-gen/locks.json';
const BATCHES_FILE = 'image-gen/batches.json';
const MAX_LOGS = 500;

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

async function readStore(file, fallback) {
  try {
    const data = await readSiteConfigJson(file, fallback);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeStore(file, payload) {
  await writeSiteConfigJson(file, payload);
}

function normalizeLog(row) {
  return {
    id: row.id || randomUUID(),
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
    sku: row.sku || null,
    slot: row.slot ?? null,
    operation: row.operation || 'transform',
    model: row.model || null,
    image_style: row.image_style || row.imageStyle || null,
    tokens_in: Number(row.tokens_in ?? row.tokensIn ?? 0),
    tokens_out: Number(row.tokens_out ?? row.tokensOut ?? 0),
    cost_usd: Number(row.cost_usd ?? row.costUsd ?? 0),
    cost_zar: Number(row.cost_zar ?? row.costZar ?? 0),
    processing_ms: row.processing_ms ?? row.processingMs ?? null,
    operator: row.operator || null,
    batch_id: row.batch_id || row.batchId || null,
    status: row.status || 'ok',
    error: row.error || null,
  };
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

export async function logImageGenCost(_sb, entry) {
  const usdToZar = entry.usdToZar ?? await fetchUsdToZarRate();
  const costUsd = Number(entry.costUsd ?? entry.cost_usd ?? 0);
  const costZar = Number(entry.costZar ?? entry.cost_zar ?? (costUsd * usdToZar).toFixed(4));
  const row = normalizeLog({
    ...entry,
    cost_usd: costUsd,
    cost_zar: costZar,
  });

  try {
    const store = await readStore(COSTS_FILE, { logs: [] });
    const logs = [row, ...(store.logs || [])].slice(0, MAX_LOGS);
    await writeStore(COSTS_FILE, { logs });
  } catch (err) {
    console.warn('logImageGenCost:', err?.message || err);
  }

  return { costUsd, costZar, usdToZar };
}

function purgeExpiredLocks(locks = []) {
  const now = Date.now();
  return locks.filter((l) => new Date(l.expires_at || l.expiresAt).getTime() > now);
}

export async function purgeExpiredLocksStore() {
  const store = await readStore(LOCKS_FILE, { locks: [] });
  const locks = purgeExpiredLocks(store.locks || []);
  if (locks.length !== (store.locks || []).length) {
    await writeStore(LOCKS_FILE, { locks });
  }
  return locks;
}

export async function acquireImageGenLock(_sb, { sku, slot, batchId, operator, ttlSec = 180 } = {}) {
  const cleanSku = String(sku || '').trim();
  const cleanSlot = Math.min(4, Math.max(1, Number(slot) || 1));
  if (!cleanSku) throw new Error('Missing SKU for lock');

  const locks = await purgeExpiredLocksStore();
  const key = `${cleanSku}::${cleanSlot}`;
  const existing = locks.find((l) => `${l.sku}::${l.slot}` === key);

  if (existing) {
    if (existing.batch_id === batchId || existing.batchId === batchId) {
      return { locked: true, sku: cleanSku, slot: cleanSlot, reentry: true };
    }
    const who = existing.operator || 'another user';
    throw new Error(`"${cleanSku}" slot ${cleanSlot} is in use by ${who}. Wait for their batch to finish or try again shortly.`);
  }

  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  locks.push({
    sku: cleanSku,
    slot: cleanSlot,
    batch_id: batchId || null,
    operator: operator || null,
    locked_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  await writeStore(LOCKS_FILE, { locks });
  return { locked: true, sku: cleanSku, slot: cleanSlot };
}

export async function releaseImageGenLock(_sb, sku, slot) {
  try {
    const cleanSku = String(sku || '').trim();
    const cleanSlot = Math.min(4, Math.max(1, Number(slot) || 1));
    const store = await readStore(LOCKS_FILE, { locks: [] });
    const locks = (store.locks || []).filter((l) => !(l.sku === cleanSku && Number(l.slot) === cleanSlot));
    await writeStore(LOCKS_FILE, { locks });
  } catch { /* ignore */ }
}

export async function registerImageGenBatch(_sb, { batchId, operator, total, style, productCount } = {}) {
  if (!batchId) return;
  try {
    const store = await readStore(BATCHES_FILE, { batches: [] });
    const batches = (store.batches || []).filter((b) => b.id !== batchId);
    batches.unshift({
      id: batchId,
      operator: operator || null,
      status: 'running',
      total: Number(total) || 0,
      done: 0,
      failed: 0,
      style: style || null,
      product_count: Number(productCount) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await writeStore(BATCHES_FILE, { batches: batches.slice(0, 50) });
  } catch (err) {
    console.warn('registerImageGenBatch:', err?.message || err);
  }
}

export async function updateImageGenBatch(_sb, batchId, patch = {}) {
  if (!batchId) return;
  try {
    const store = await readStore(BATCHES_FILE, { batches: [] });
    const batches = (store.batches || []).map((b) => {
      if (b.id !== batchId) return b;
      const next = {
        ...b,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      if (patch.status === 'complete' || patch.status === 'cancelled') {
        next.finished_at = new Date().toISOString();
      }
      return next;
    });
    await writeStore(BATCHES_FILE, { batches });
  } catch { /* ignore */ }
}

export async function listImageGenCosts(_sb, { days = 30, limit = 200 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const store = await readStore(COSTS_FILE, { logs: [] });
  return (store.logs || [])
    .map(normalizeLog)
    .filter((row) => new Date(row.created_at).getTime() >= since)
    .slice(0, Math.min(limit, 500));
}

export async function listActiveImageGenState(_sb) {
  const locks = await purgeExpiredLocksStore();
  const store = await readStore(BATCHES_FILE, { batches: [] });
  const batches = (store.batches || []).filter((b) => b.status === 'running');
  return { locks, batches };
}

export function summarizeCosts(logs = []) {
  const totals = { usd: 0, zar: 0, count: 0, errors: 0 };
  const byDay = new Map();
  const byOperator = new Map();
  const byOperation = new Map();

  for (const row of logs.map(normalizeLog)) {
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
