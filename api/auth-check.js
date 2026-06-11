import { requireAdminKey } from './_admin-auth.js';

/** Validates the dashboard key supplied at login. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAdminKey(req, res)) return;
  return res.status(200).json({ ok: true });
}
