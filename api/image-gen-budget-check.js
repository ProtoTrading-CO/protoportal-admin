import { requireCronOrAdminKey } from './_admin-auth.js';
import { getStockClient } from './_image-gen-cost.js';
import { getImageGenBudgetStatus, maybeSendImageGenBudgetAlerts } from './_image-gen-budget.js';

export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const sb = getStockClient();
    const [budget, alertResult] = await Promise.all([
      getImageGenBudgetStatus(sb),
      maybeSendImageGenBudgetAlerts(sb),
    ]);
    return res.status(200).json({
      ok: true,
      budget,
      alertsSent: alertResult.alerts,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Budget check failed' });
  }
}
