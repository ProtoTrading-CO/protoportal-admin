import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Admin API auth.
 *
 * Two mechanisms:
 *  1. Dashboard key — `x-admin-key` header must match ADMIN_DASH_KEY env.
 *     The dashboard asks for this key once at login and stores it locally.
 *  2. Signed per-order token — `x-order-token` header (or `k` query param)
 *     must be HMAC(orderId, ORDER_NOTIFY_SECRET). These tokens are embedded
 *     in WhatsApp fulfillment links so the team can work an order without a
 *     dashboard login, but only for that specific order.
 *     Keep in sync with protoportal-main/api/_order-token.js.
 */

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hasAdminKey(req) {
  const expected = process.env.ADMIN_DASH_KEY;
  if (!expected) return false;
  const provided = req.headers['x-admin-key'];
  return Boolean(provided) && safeEqual(provided, expected);
}

export function orderToken(orderId) {
  const secret = process.env.ORDER_NOTIFY_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(`order:${String(orderId).trim()}`).digest('hex').slice(0, 32);
}

export function verifyOrderToken(orderId, token) {
  if (!orderId || !token) return false;
  const expected = orderToken(orderId);
  if (!expected) return false;
  return safeEqual(token, expected);
}

function extractOrderId(req) {
  return String(
    req.headers['x-order-id']
    || req.query?.orderId
    || req.query?.id
    || req.body?.orderId
    || req.body?.id
    || '',
  ).trim();
}

function extractOrderToken(req) {
  return String(req.headers['x-order-token'] || req.query?.k || req.body?.orderToken || '').trim();
}

/** Admin dashboard key required. Sends 401/503 and returns false on failure. */
export function requireAdminKey(req, res) {
  if (!process.env.ADMIN_DASH_KEY) {
    res.status(503).json({ error: 'ADMIN_DASH_KEY is not configured on this deployment' });
    return false;
  }
  if (hasAdminKey(req)) return true;
  res.status(401).json({ error: 'Unauthorised — admin key required' });
  return false;
}

/**
 * Admin key OR a valid signed token for the order referenced in the request.
 * Used by fulfillment endpoints reached from WhatsApp links without a login.
 */
export function requireAdminOrOrderToken(req, res) {
  if (hasAdminKey(req)) return true;
  const orderId = extractOrderId(req);
  const token = extractOrderToken(req);
  if (orderId && verifyOrderToken(orderId, token)) return true;
  res.status(401).json({ error: 'Unauthorised' });
  return false;
}

/** Vercel cron (Authorization: Bearer CRON_SECRET) or admin key. */
export function requireCronOrAdminKey(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = String(req.headers.authorization || '');
  if (cronSecret && safeEqual(authHeader, `Bearer ${cronSecret}`)) return true;
  if (hasAdminKey(req)) return true;
  res.status(401).json({ error: 'Unauthorised' });
  return false;
}
