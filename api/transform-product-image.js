import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const BUCKET = 'product-images';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function getPhotoRoomKey() {
  const deploymentEnv = process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (deploymentEnv !== 'production' && process.env.PHOTOROOM_SANDBOX_API_KEY) {
    return { key: process.env.PHOTOROOM_SANDBOX_API_KEY, mode: 'sandbox' };
  }
  if (process.env.PHOTOROOM_API_KEY) {
    return { key: process.env.PHOTOROOM_API_KEY, mode: 'live' };
  }
  if (process.env.PHOTOROOM_SANDBOX_API_KEY) {
    return { key: process.env.PHOTOROOM_SANDBOX_API_KEY, mode: 'sandbox' };
  }
  return null;
}

async function uploadTransformedImage(buffer, filename) {
  const supabase = getStockAdminClient();
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const safeName = `photoroom-${Date.now()}-${String(filename || 'product').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')}.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(safeName, buffer, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(error.message);

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
  return publicUrl;
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64 } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ error: 'Please upload a JPG, PNG, or WEBP image.' });
  }

  const credentials = getPhotoRoomKey();
  if (!credentials?.key) {
    return res.status(500).json({ error: 'PhotoRoom is not configured on this project yet.' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const form = new FormData();
    form.append('imageFile', new Blob([buffer], { type: contentType }), filename);
    form.append('removeBackground', 'true');
    form.append('background.color', 'FFFFFF');
    form.append('padding', '0.08');
    form.append('outputSize', '1600x1600');
    form.append('export.format', 'png');

    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: { 'x-api-key': credentials.key },
      body: form,
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({ error: details || 'PhotoRoom transform failed' });
    }

    const transformedBuffer = Buffer.from(await response.arrayBuffer());
    const url = await uploadTransformedImage(transformedBuffer, filename);
    return res.status(200).json({ url, mode: credentials.mode });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'PhotoRoom transform failed' });
  }
}