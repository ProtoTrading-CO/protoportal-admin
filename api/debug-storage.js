import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const results = {};

  const configs = [
    { name: 'stock', url: process.env.VITE_STOCK_SUPABASE_URL, key: process.env.VITE_STOCK_SUPABASE_KEY },
    { name: 'main-anon', url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY },
    { name: 'main-service', url: process.env.VITE_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
  ];

  for (const cfg of configs) {
    const entry = {
      url: cfg.url ? cfg.url.slice(0, 40) + '…' : 'MISSING',
      keyPrefix: cfg.key ? cfg.key.slice(0, 12) + '…' : 'MISSING',
    };

    if (!cfg.url || !cfg.key) { entry.skip = 'missing env'; results[cfg.name] = entry; continue; }

    try {
      const sb = createClient(cfg.url, cfg.key, { auth: { autoRefreshToken: false, persistSession: false } });

      // List buckets
      const { data: buckets, error: listErr } = await sb.storage.listBuckets();
      entry.listBuckets = listErr ? `ERR: ${listErr.message}` : (buckets || []).map(b => b.name);

      // Try to create bucket
      const { error: createErr } = await sb.storage.createBucket('product-images', { public: true });
      entry.createBucket = createErr ? `ERR: ${createErr.message}` : 'ok';

      // Try tiny upload
      const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      const { error: uploadErr } = await sb.storage.from('product-images').upload(`debug-test-${Date.now()}.png`, tiny, { contentType: 'image/png', upsert: true });
      entry.upload = uploadErr ? `ERR: ${uploadErr.message}` : 'ok';

    } catch (e) {
      entry.thrown = e.message;
    }

    results[cfg.name] = entry;
  }

  return res.status(200).json(results);
}
