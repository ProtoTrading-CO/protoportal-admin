import { requireAdminKey } from './_admin-auth.js';
import {
  clampToLibrary,
  isNutstoreConfigured,
  isPathInLibrary,
  listNutstoreDirectory,
  listNutstoreImagesRecursive,
  libraryRoot,
  nutstoreSetupMessage,
  testNutstoreConnection,
} from './_nutstore-webdav.js';

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
        const rootPath = libraryRoot();
        return res.status(200).json({
          ok: true,
          configured: true,
          rootPath,
          libraryRoot: rootPath,
          libraryLabel: 'PTR Photos',
          ...status,
        });
      } catch (err) {
        return res.status(502).json({
          ok: false,
          configured: true,
          libraryRoot: libraryRoot(),
          libraryLabel: 'PTR Photos',
          error: err.message || 'Nutstore unreachable',
        });
      }
    }

    const path = clampToLibrary(req.query.path || libraryRoot());
    const recursive = String(req.query.recursive || '').trim() === '1';
    const q = String(req.query.q || '').trim().toLowerCase();

    try {
      if (recursive) {
        const { images, count } = await listNutstoreImagesRecursive(path);
        const filtered = q
          ? images.filter((img) => img.name.toLowerCase().includes(q) || img.path.toLowerCase().includes(q))
          : images;
        return res.status(200).json({ path, recursive: true, entries: filtered, count: filtered.length, libraryRoot: libraryRoot() });
      }

      const { entries } = await listNutstoreDirectory(path);
      const filtered = q
        ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
        : entries;
      return res.status(200).json({ path, recursive: false, entries: filtered, libraryRoot: libraryRoot() });
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Nutstore browse failed' });
    }
  }

  return res.status(405).end();
}
