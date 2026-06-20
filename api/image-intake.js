import { requireAdminKey } from './_admin-auth.js';
import { getStockClient } from './_stock-client.js';
import { parseIntakeFilename } from './_image-intake-utils.js';
import { buildIntakePreview, processIntakeImage } from './_image-intake-process.js';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

/**
 * Admin Image Intake — synchronous flow (product_image_intake.py reference).
 * POST action=preview | process
 */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getStockClient();

  if (req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    try {
      const { data, error } = await supabase
        .from('image_intake_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error && /image_intake_queue/.test(error.message)) {
        return res.status(200).json({ rows: [] });
      }
      if (error) throw error;
      return res.status(200).json({ rows: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load history' });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const action = String(body.action || 'process').toLowerCase();
  const { filename, contentType, base64 } = body;
  const dryRun = body.dryRun === true || String(body.dryRun || '').toLowerCase() === 'true';

  if (!filename) {
    return res.status(400).json({ error: 'filename is required' });
  }

  try {
    if (action === 'preview') {
      const preview = await buildIntakePreview(supabase, filename, { contentType, base64 });
      return res.status(200).json({ ok: true, preview });
    }

    if (action !== 'process') {
      return res.status(400).json({ error: 'action must be preview or process' });
    }

    if (!base64 && !dryRun) {
      return res.status(400).json({ error: 'base64 is required for process (unless dryRun=true)' });
    }

    const result = await processIntakeImage(supabase, {
      filename,
      contentType,
      base64: base64 || '',
      dryRun,
    });

    const now = new Date().toISOString();
    await supabase.from('image_intake_queue').insert({
      status: result.status === 'completed' ? 'completed' : result.status === 'dry_run' ? 'pending' : 'failed',
      source_sku: result.sourceSku || parseIntakeFilename(filename).sourceSku,
      image_number: result.imageNumber || 1,
      image_column: result.imageColumn || 'image_url_one',
      original_filename: filename,
      content_type: contentType || null,
      staging_path: result.objectPath || `direct/${filename}`,
      staging_url: result.imageUrl || null,
      final_image_url: result.imageUrl || null,
      product_sku: result.sourceSku || null,
      sql_code: result.sql?.code || null,
      sql_title: result.sql?.title || null,
      sql_price: result.sql?.price ?? null,
      sql_onhand: result.sql?.onhand ?? null,
      sql_dept: result.sql?.dept || null,
      error_message: result.ok ? null : (result.message || null),
      processed_at: now,
      created_at: now,
      updated_at: now,
    }).catch((err) => {
      console.warn('image-intake history insert:', err?.message);
    });

    if (!result.ok) {
      return res.status(422).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('image-intake error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Image intake failed' });
  }
}
