import { requireAdminKey } from './_admin-auth.js';
import {
  getStockClient,
  listActiveImageGenState,
  listImageGenCosts,
  registerImageGenBatch,
  summarizeCosts,
  updateImageGenBatch,
} from './_image-gen-cost.js';

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const sb = getStockClient();

  if (req.method === 'GET') {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query?.days) || 30));
      const limit = Math.min(500, Math.max(50, Number(req.query?.limit) || 200));
      const [logs, active] = await Promise.all([
        listImageGenCosts(sb, { days, limit }),
        listActiveImageGenState(sb),
      ]);
      return res.status(200).json({
        logs,
        summary: summarizeCosts(logs),
        active,
        usdToZar: logs[0]?.cost_zar && logs[0]?.cost_usd
          ? Number(logs[0].cost_zar) / Number(logs[0].cost_usd)
          : null,
      });
    } catch (err) {
      const msg = err.message || 'Failed to load image gen costs';
      if (/does not exist|relation/i.test(msg)) {
        return res.status(503).json({
          error: 'Cost tracking tables not installed — run migrations/019_image_gen_tracking.sql on stock Supabase',
          logs: [],
          summary: summarizeCosts([]),
          active: { locks: [], batches: [] },
        });
      }
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    const operator = String(req.body?.operator || req.headers['x-image-gen-operator'] || 'Unknown').slice(0, 64);

    if (action === 'registerBatch') {
      const { batchId, total, style, productCount } = req.body || {};
      if (!batchId) return res.status(400).json({ error: 'batchId is required' });
      await registerImageGenBatch(sb, { batchId, operator, total, style, productCount });
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateBatch') {
      const { batchId, done, failed, status } = req.body || {};
      if (!batchId) return res.status(400).json({ error: 'batchId is required' });
      await updateImageGenBatch(sb, batchId, {
        ...(done != null ? { done: Number(done) } : {}),
        ...(failed != null ? { failed: Number(failed) } : {}),
        ...(status ? { status } : {}),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  return res.status(405).end();
}
