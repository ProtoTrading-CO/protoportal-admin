import { requireAdminKey } from './_admin-auth.js';
import { notifyNewOrder } from './_order-notify-core.js';

/**
 * Send the full new-order notification round for one order: the alert email
 * to online@proto.co.za (once) plus team WhatsApp via the main portal
 * notification API.
 */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const result = await notifyNewOrder(orderId);
  const status = result.httpStatus && result.httpStatus >= 400 ? result.httpStatus : (result.error ? 500 : 200);
  return res.status(result.error && status < 400 ? 500 : status).json(result);
}
