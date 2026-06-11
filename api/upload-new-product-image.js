import { requireAdminKey } from './_admin-auth.js';
// Dedicated image upload for new/dormant products.
// Uses the MAIN Supabase project (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// which has a proper JWT service-role key that Storage accepts.

import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const BUCKET = 'product-images';

function getClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Missing env: VITE_SUPABASE_URL=${!!url} SUPABASE_SERVICE_ROLE_KEY=${!!key}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64 } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }

  let sb;
  try {
    sb = getClient();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Create bucket if needed — report the actual error if it's not "already exists"
  const { error: bucketErr } = await sb.storage.createBucket(BUCKET, { public: true });
  if (bucketErr && !bucketErr.message?.toLowerCase().includes('already exist')) {
    // Non-fatal: bucket probably already exists, continue
    // (but if it's a real auth error, the upload will also fail and we'll see it then)
  }

  const buffer = Buffer.from(base64, 'base64');
  const safe = `np-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(safe, buffer, { contentType, upsert: false });

  if (uploadErr) {
    return res.status(400).json({ error: uploadErr.message, detail: JSON.stringify(uploadErr) });
  }

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(safe);
  return res.status(200).json({ url: publicUrl });
}
