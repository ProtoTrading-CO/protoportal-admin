import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import { normalizePromoCodes } from '../lib/promo-codes.mjs';

const FILE = 'promo-codes.json';
const DEFAULTS = { codes: [], updatedAt: null };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = await readSiteConfigJson(FILE, DEFAULTS);
      return res.status(200).json({
        codes: normalizePromoCodes(data?.codes),
        updatedAt: data?.updatedAt || null,
      });
    } catch {
      return res.status(200).json(DEFAULTS);
    }
  }

  if (req.method === 'POST') {
    if (!(await requireAdminKey(req, res))) return;
    try {
      const body = req.body || {};
      const codes = normalizePromoCodes(body.codes);
      const saved = await writeSiteConfigJson(FILE, { codes });
      return res.status(200).json({ ok: true, codes: saved.codes, updatedAt: saved.updatedAt });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Save failed' });
    }
  }

  return res.status(405).end();
}
