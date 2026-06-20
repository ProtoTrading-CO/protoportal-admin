import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';

const FILE = 'broadcast-schedule.json';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = await readSiteConfigJson(FILE, { items: [] });
      return res.status(200).json({ items: data.items || [] });
    } catch {
      return res.status(200).json({ items: [] });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      if (body.deleteId) {
        const current = await readSiteConfigJson(FILE, { items: [] });
        const items = (current.items || []).filter((item) => item.id !== body.deleteId);
        const saved = await writeSiteConfigJson(FILE, { items });
        return res.status(200).json({ ok: true, items: saved.items });
      }
      const items = Array.isArray(body.items) ? body.items : [];
      const saved = await writeSiteConfigJson(FILE, { items });
      return res.status(200).json({ ok: true, items: saved.items });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
