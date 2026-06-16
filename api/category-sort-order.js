import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';

const SORT_FILE = 'sort-orders/orders.json';

async function readStore() {
  return readSiteConfigJson(SORT_FILE, { orders: {}, updatedAt: null });
}

/** GET sort order for a category key; POST save with optimistic version check. */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!requireAdminKey(req, res)) return;
    const categoryKey = String(req.query.categoryKey || '').trim();
    try {
      const store = await readStore();
      if (!categoryKey) {
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
        return res.status(200).json(store);
      }
      const entry = store.orders?.[categoryKey] || { skuOrder: [], updatedAt: null };
      return res.status(200).json({ categoryKey, ...entry, storeUpdatedAt: store.updatedAt });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    if (!requireAdminKey(req, res)) return;
    const { categoryKey, skuOrder, expectedUpdatedAt, legacyKeys = [] } = req.body || {};
    const key = String(categoryKey || '').trim();
    if (!key || !Array.isArray(skuOrder)) {
      return res.status(400).json({ error: 'categoryKey and skuOrder[] required' });
    }
    try {
      const store = await readStore();
      const entry = store.orders?.[key];
      if (expectedUpdatedAt && entry?.updatedAt && entry.updatedAt !== expectedUpdatedAt) {
        return res.status(409).json({
          error: 'This category was reordered by someone else — reload to see the latest order.',
          currentUpdatedAt: entry.updatedAt,
        });
      }
      const now = new Date().toISOString();
      const nextOrders = { ...(store.orders || {}) };
      for (const legacy of legacyKeys) {
        const lk = String(legacy || '').trim();
        if (lk && lk !== key) delete nextOrders[lk];
      }
      nextOrders[key] = { skuOrder: skuOrder.map(String), updatedAt: now };
      const next = { orders: nextOrders, updatedAt: now };
      await writeSiteConfigJson(SORT_FILE, next);
      return res.status(200).json({ ok: true, categoryKey: key, updatedAt: now });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
