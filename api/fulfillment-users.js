import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import { defaultFulfillmentUsers } from './_fulfillment-defaults.js';

const USERS_FILE = 'fulfillment/users.json';

function normalizeUsers(payload) {
  const users = (payload?.users || []).map((u, i) => ({
    id: String(u.id || `user-${i + 1}`).trim(),
    name: String(u.name || '').trim(),
    whatsapp: String(u.whatsapp || '').trim(),
    categoryIds: Array.isArray(u.categoryIds) ? u.categoryIds.filter(Boolean).slice(0, 2) : [],
  })).filter((u) => u.name);
  return { users };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      let data = await readSiteConfigJson(USERS_FILE, null);
      if (!data?.users?.length) {
        data = defaultFulfillmentUsers();
        await writeSiteConfigJson(USERS_FILE, data);
      }
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load fulfillment users' });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = normalizeUsers(req.body || {});
      if (!data.users.length) return res.status(400).json({ error: 'At least one user is required' });
      await writeSiteConfigJson(USERS_FILE, data);
      return res.status(200).json(data);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Failed to save fulfillment users' });
    }
  }

  return res.status(405).end();
}
