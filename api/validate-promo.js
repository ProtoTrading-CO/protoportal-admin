import { readSiteConfigJson } from './_site-config.js';
import { validatePromoEntry } from '../lib/promo-codes.mjs';

const FILE = 'promo-codes.json';
const DEFAULTS = { codes: [] };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const code = body.code;
    const orderTotal = Number(body.orderTotal) || 0;
    const data = await readSiteConfigJson(FILE, DEFAULTS);
    const result = validatePromoEntry(data, { code, orderTotal });
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }
    return res.status(200).json({
      valid: true,
      code: result.code,
      discountPct: result.discountPct,
      label: result.label,
      minOrder: result.minOrder,
    });
  } catch (err) {
    return res.status(500).json({ valid: false, error: err.message || 'Validation failed' });
  }
}
