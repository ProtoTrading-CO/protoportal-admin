import { requireAdminKey } from './_admin-auth.js';
import {
  isNutstoreConfigured,
  listNutstoreDirectory,
  listNutstoreImagesRecursive,
  nutstoreSetupMessage,
  normalizeDavPath,
  testNutstoreConnection,
} from './_nutstore-webdav.js';
import { nutstoreConfig } from './_nutstore-webdav.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (!isNutstoreConfigured()) {
    return res.status(503).json({ error: nutstoreSetupMessage(), configured: false });
  }

  if (req.method === 'GET') {
    const action = String(req.query.action || 'list').trim();
    if (action === 'status') {
      try {
        const status = await testNutstoreConnection();
        const { rootPath } = nutstoreConfig();
        return res.status(200).json({ ok: true, configured: true, rootPath, ...status });
      } catch (err) {
        return res.status(502).json({ ok: false, configured: true, error: err.message || 'Nutstore unreachable' });
      }
    }

    const path = normalizeDavPath(req.query.path || nutstoreConfig().rootPath);
    const recursive = String(req.query.recursive || '').trim() === '1';
    const q = String(req.query.q || '').trim().toLowerCase();

    try {
      if (recursive) {
        const { images, count } = await listNutstoreImagesRecursive(path);
        const filtered = q
          ? images.filter((img) => img.name.toLowerCase().includes(q) || img.path.toLowerCase().includes(q))
          : images;
        return res.status(200).json({ path, recursive: true, entries: filtered, count: filtered.length });
      }

      const { entries } = await listNutstoreDirectory(path);
      const filtered = q
        ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
        : entries;
      return res.status(200).json({ path, recursive: false, entries: filtered });
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Nutstore browse failed' });
    }
  }

  return res.status(405).end();
}
