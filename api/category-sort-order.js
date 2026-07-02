import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';

const SORT_FILE = 'sort-orders/orders.json';

async function readStore() {
  return readSiteConfigJson(SORT_FILE, { orders: {}, updatedAt: null });
}

/** GET sort order for a category key; POST save with optimistic version check. */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!(await requireAdminKey(req, res))) return;
    const categoryKey = String(req.query.categoryKey || '').trim();
    try {
      const store = await readStore();
      if (!categoryKey) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(store);
      }
      res.setHeader('Cache-Control', 'no-store');
      const entry = store.orders?.[categoryKey] || { skuOrder: [], updatedAt: null };
      return res.status(200).json({ categoryKey, ...entry, storeUpdatedAt: store.updatedAt });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    if (!(await requireAdminKey(req, res))) return;
    const { categoryKey, skuOrder, legacyKeys = [], expectedStoreUpdatedAt } = req.body || {};
    const key = String(categoryKey || '').trim();
    if (!key || !Array.isArray(skuOrder)) {
      return res.status(400).json({ error: 'categoryKey and skuOrder[] required' });
    }
    try {
      const store = await readStore();
      const expected = expectedStoreUpdatedAt != null ? String(expectedStoreUpdatedAt) : '';
      if (expected && store.updatedAt && expected !== store.updatedAt) {
        return res.status(409).json({ error: 'Sort order changed elsewhere — refresh and retry' });
      }
      const fresh = await readStore();
      if (expected && fresh.updatedAt && expected !== fresh.updatedAt) {
        return res.status(409).json({ error: 'Sort order changed elsewhere — refresh and retry' });
      }
      const now = new Date().toISOString();
      const nextOrders = { ...(fresh.orders || {}) };
      for (const legacy of legacyKeys) {
        const lk = String(legacy || '').trim();
        if (lk && lk !== key) delete nextOrders[lk];
      }
      nextOrders[key] = { skuOrder: skuOrder.map(String), updatedAt: now };
      const next = { orders: nextOrders, updatedAt: now };
      await writeSiteConfigJson(SORT_FILE, next);
      return res.status(200).json({ ok: true, categoryKey: key, updatedAt: now, storeUpdatedAt: now });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
