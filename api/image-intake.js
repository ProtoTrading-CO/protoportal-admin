import { requireAdminKey } from './_admin-auth.js';
import { getStockClient } from './_stock-client.js';
import {
  STAGING_BUCKET,
  parseIntakeFilename,
  stagingObjectName,
} from './_image-intake-utils.js';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

async function uploadStagingImage(supabase, { filename, contentType, base64, sourceSku, imageNumber }) {
  await supabase.storage.createBucket(STAGING_BUCKET, { public: true }).catch(() => {});
  const stagingPath = stagingObjectName(sourceSku, imageNumber, filename);
  const buffer = Buffer.from(base64, 'base64');
  const { error } = await supabase.storage
    .from(STAGING_BUCKET)
    .upload(stagingPath, buffer, { contentType: contentType || 'application/octet-stream', upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(STAGING_BUCKET).getPublicUrl(stagingPath);
  return { stagingPath, stagingUrl: publicUrl };
}

/**
 * Image intake queue API.
 * Admin uploads enqueue only — no SQL, no direct product writes.
 * BLADERUNNER-PC worker processes pending rows.
 */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getStockClient();

  if (req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const status = String(req.query.status || '').trim();
    try {
      let q = supabase
        .from('image_intake_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) {
        if (/image_intake_queue/.test(error.message)) {
          return res.status(503).json({
            error: 'Queue table missing — run migration 025_image_intake_queue.sql on the stock Supabase project.',
          });
        }
        throw error;
      }
      return res.status(200).json({ rows: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load queue' });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { filename, contentType, base64 } = req.body || {};
  if (!filename || !base64) {
    return res.status(400).json({ error: 'filename and base64 are required' });
  }

  const { sourceSku, imageNumber, imageColumn } = parseIntakeFilename(filename);
  if (!sourceSku) return res.status(400).json({ error: 'Could not parse SKU from filename' });

  try {
    const { stagingPath, stagingUrl } = await uploadStagingImage(supabase, {
      filename,
      contentType,
      base64,
      sourceSku,
      imageNumber,
    });

    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from('image_intake_queue')
      .insert({
        status: 'pending',
        source_sku: sourceSku,
        image_number: imageNumber,
        image_column: imageColumn,
        original_filename: filename,
        content_type: contentType || null,
        staging_path: stagingPath,
        staging_url: stagingUrl,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      queued: true,
      queueId: row.id,
      status: row.status,
      sourceSku,
      imageNumber,
      imageColumn,
      stagingUrl,
      message: 'Queued for BLADERUNNER-PC worker — website is not connected to SQL.',
    });
  } catch (err) {
    console.error('image-intake enqueue error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Failed to enqueue image' });
  }
}
