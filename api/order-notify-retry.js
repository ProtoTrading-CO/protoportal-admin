import { requireAdminKey } from './_admin-auth.js';
/** Retry team WhatsApp for an order (proxies to main portal notify API). */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const mainUrl = (process.env.MAIN_PORTAL_URL || 'https://protoportal-main.vercel.app').replace(/\/$/, '');
  const secret = process.env.ORDER_NOTIFY_SECRET;

  if (!secret) {
    return res.status(503).json({ error: 'ORDER_NOTIFY_SECRET is not configured on admin portal' });
  }

  try {
    const resp = await fetch(`${mainUrl}/api/order-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-order-notify-secret': secret,
      },
      body: JSON.stringify({ orderId, emailSent: true }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Retry failed' });
  }
}
