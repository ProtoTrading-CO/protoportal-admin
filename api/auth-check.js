import { requireAdminKey, verifyAdminUser } from './_admin-auth.js';

/** Session probe for the admin SPA after Supabase login. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  if (!(await requireAdminKey(req, res))) return;

  const user = await verifyAdminUser(req);
  return res.status(200).json({
    ok: true,
    email: user?.email || null,
  });
}
