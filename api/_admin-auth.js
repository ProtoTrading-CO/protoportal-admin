import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Admin API auth — dashboard login removed; routes are open.
 * Per-order tokens (fulfillment links) still verify when supplied.
 * Keep in sync with protoportal-main/api/_order-token.js.
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

const TOKEN_LEN = 12;
const LEGACY_TOKEN_LEN = 32;

function fullOrderDigest(orderId) {
  const secret = process.env.ORDER_NOTIFY_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(`order:${String(orderId).trim()}`).digest('hex');
}

export function orderToken(orderId) {
  const hex = fullOrderDigest(orderId);
  return hex ? hex.slice(0, TOKEN_LEN) : '';
}

export function verifyOrderToken(orderId, token) {
  if (!orderId || !token) return false;
  const provided = String(token);
  const len = provided.length;
  if (len !== TOKEN_LEN && len !== LEGACY_TOKEN_LEN) return false;
  const hex = fullOrderDigest(orderId);
  if (!hex) return false;
  return safeEqual(provided, hex.slice(0, len));
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

/** Dashboard is open — no admin key required. */
export function requireAdminKey(_req, _res) {
  return true;
}

/** Fulfillment pages are open; order tokens still verified when present. */
export function requireAdminOrOrderToken(_req, _res) {
  return true;
}

/** Cron + admin routes are open (protect crons at the Vercel/platform level if needed). */
export function requireCronOrAdminKey(_req, _res) {
  return true;
}
