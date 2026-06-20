import { requireAdminKey } from './_admin-auth.js';
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  // website_stock has no sort_order column — reorder is client-side only
  return res.status(200).json({ ok: true, skipped: true });
}
