import { requireAdminKey } from './_admin-auth.js';
import {
  listActiveImageGenState,
  listImageGenCosts,
  registerImageGenBatch,
  summarizeCosts,
  updateImageGenBatch,
  getStockClient,
} from './_image-gen-cost.js';
import { getImageGenBudgetStatus, saveImageGenBudgetConfig } from './_image-gen-budget.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query?.days) || 30));
      const limit = Math.min(500, Math.max(50, Number(req.query?.limit) || 200));
      const sb = getStockClient();
      const [logs, active, budget] = await Promise.all([
        listImageGenCosts(sb, { days, limit }),
        listActiveImageGenState(sb),
        getImageGenBudgetStatus(sb),
      ]);
      return res.status(200).json({
        logs,
        summary: summarizeCosts(logs),
        active,
        budget,
        usdToZar: logs[0]?.cost_zar && logs[0]?.cost_usd
          ? Number(logs[0].cost_zar) / Number(logs[0].cost_usd)
          : budget?.spend?.usdToZar ?? null,
      });
    } catch (err) {
      const msg = err?.message || 'Failed to load image gen costs';
      if (/Missing VITE_SUPABASE|SUPABASE_SERVICE_ROLE/i.test(msg)) {
        return res.status(503).json({
          error: 'Cost storage is not configured on this deployment (missing Supabase service role key).',
          logs: [],
          summary: summarizeCosts([]),
          active: { locks: [], batches: [] },
          budget: null,
        });
      }
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    const operator = String(req.body?.operator || req.headers['x-image-gen-operator'] || 'Unknown').slice(0, 64);
    const sb = getStockClient();

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

    if (action === 'saveBudget') {
      const { dailyUsd, monthlyUsd, alertEmail, blockAtLimit, alertsEnabled } = req.body || {};
      const config = await saveImageGenBudgetConfig({
        ...(dailyUsd != null ? { dailyUsd } : {}),
        ...(monthlyUsd != null ? { monthlyUsd } : {}),
        ...(alertEmail != null ? { alertEmail } : {}),
        ...(blockAtLimit != null ? { blockAtLimit: Boolean(blockAtLimit) } : {}),
        ...(alertsEnabled != null ? { alertsEnabled: Boolean(alertsEnabled) } : {}),
      });
      const budget = await getImageGenBudgetStatus(sb);
      return res.status(200).json({ ok: true, config, budget });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  return res.status(405).end();
}
