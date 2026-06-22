import { requireAdminOrOrderToken } from './_admin-auth.js';
import { readSiteConfigJson, getPortalAdminClient } from './_site-config.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import { advanceOrderStatus } from './_order-status.js';

function progressFile(orderId) {
  return `fulfillment/progress/${orderId}.json`;
}

function emptyProgress(orderId) {
  return { orderId, sections: {}, updatedAt: new Date().toISOString() };
}

export default async function handler(req, res) {
  if (!(await requireAdminOrOrderToken(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  const { orderId } = req.method === 'GET' ? req.query : (req.body || {});

  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  if (req.method === 'GET') {
    try {
      const data = await readSiteConfigJson(progressFile(orderId), null);
      return res.status(200).json(data?.orderId === orderId ? data : emptyProgress(orderId));
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load progress' });
    }
  }

  if (req.method === 'POST') {
    const { userId, userName, categoryId, items, complete = true } = req.body || {};
    if (!userId || !categoryId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'userId, categoryId, and items are required' });
    }

    try {
      const file = progressFile(orderId);
      const result = await mutateSiteConfigJson(file, emptyProgress(orderId), (current) => {
        const store = current?.orderId === orderId ? current : emptyProgress(orderId);
        store.sections = store.sections || {};
        store.sections[categoryId] = {
          userId,
          userName: userName || userId,
          items,
          complete: Boolean(complete),
          savedAt: new Date().toISOString(),
        };
        store.updatedAt = new Date().toISOString();
        return { store };
      });

      const base = result?.store ?? result;

      if (Boolean(complete)) {
        try {
          const supabase = getPortalAdminClient();
          await advanceOrderStatus(supabase, orderId, 'order in progress');
        } catch (err) {
          console.error('fulfillment-progress: status advance failed:', err.message);
        }
      }

      return res.status(200).json(base);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Failed to save section' });
    }
  }

  return res.status(405).end();
}
