import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'site-config';
const FILE = 'featured-products.json';
const MAX_ITEMS = 100;

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function normalizeItems(raw) {
  const seen = new Set();
  const items = [];
  for (const row of raw || []) {
    const sku = String(row?.sku || '').trim().toUpperCase();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    items.push({
      sku,
      addedAt: row?.addedAt ? String(row.addedAt) : new Date().toISOString(),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const supabase = getAdminClient();
      const { data, error } = await supabase.storage.from(BUCKET).download(FILE);
      if (error) return res.status(200).json({ items: [], updatedAt: null });
      const text = await data.text();
      const parsed = JSON.parse(text);
      return res.status(200).json({
        items: Array.isArray(parsed?.items) ? parsed.items : [],
        updatedAt: parsed?.updatedAt || null,
      });
    } catch {
      return res.status(200).json({ items: [], updatedAt: null });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const items = normalizeItems(body.items);
      const updatedAt = new Date().toISOString();
      const payload = JSON.stringify({ items, updatedAt });
      const supabase = getAdminClient();

      await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

      const { error } = await supabase.storage.from(BUCKET).upload(FILE, payload, {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) throw error;
      return res.status(200).json({ ok: true, items, updatedAt });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Save failed' });
    }
  }

  return res.status(405).end();
}
