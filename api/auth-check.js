/** Legacy login endpoint — dashboard auth removed; always OK. */
export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (_req.method !== 'POST') return res.status(405).end();
  return res.status(200).json({ ok: true });
}
