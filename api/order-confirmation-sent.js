import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson } from './_site-config.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';

function metaPath(orderId) {
  return `orders/confirmation/${orderId}.json`;
}

export async function readConfirmationSent(orderId) {
  const data = await readSiteConfigJson(metaPath(orderId), null);
  return data?.orderId === orderId ? data : data?.sentAt ? data : null;
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const ids = String(req.query?.ids || req.query?.id || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'id or ids required' });

    const out = {};
    await Promise.all(ids.map(async (orderId) => {
      const meta = await readConfirmationSent(orderId);
      if (meta) out[orderId] = meta;
    }));
    return res.status(200).json({ confirmations: out });
  }

  if (req.method === 'POST') {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const sentAt = new Date().toISOString();
    await mutateSiteConfigJson(metaPath(orderId), { orderId }, () => ({
      orderId,
      sentAt,
      updatedAt: sentAt,
    }));
    return res.status(200).json({ ok: true, orderId, sentAt });
  }

  return res.status(405).end();
}
