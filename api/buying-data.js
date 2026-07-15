import { requireAdminKey } from './_admin-auth.js';
import { fetchBuyingHistory, isBuyingDataConfigured } from './_sql-buying.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'proto-buying-data',
      configured: isBuyingDataConfigured(),
      readOnly: true,
      maxSkus: 500,
      maxMonths: 36,
      operations: ['buying_history'],
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await fetchBuyingHistory({
      skus: req.body?.skus,
      months: req.body?.months ?? 24,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const badRequest = error?.code === 'INVALID_PARAMS';
    return res.status(badRequest ? 400 : 503).json({
      ok: false,
      error: error?.message || 'Buying data unavailable',
      code: error?.code || 'ERP_UNAVAILABLE',
    });
  }
}
