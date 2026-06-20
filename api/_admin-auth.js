import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Admin API auth — Supabase JWT + email allowlist.
 * Fulfillment routes accept admin JWT or valid per-order token.
 */

export const ADMIN_EMAILS = new Set([
  'danieljoffeinfo@gmail.com',
  'george@proto.co.za',
  'online@proto.co.za',
].map((e) => e.toLowerCase()));

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

function getSupabaseAuthClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function extractBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

export async function verifyAdminUser(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const supabase = getSupabaseAuthClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email || !isAdminEmail(user.email)) return null;
    return user;
  } catch {
    return null;
  }
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

function sendUnauthorized(res, message = 'Authentication required') {
  if (!res.headersSent) res.status(401).json({ error: message });
  return false;
}

function sendForbidden(res, message = 'Not authorized for admin access') {
  if (!res.headersSent) res.status(403).json({ error: message });
  return false;
}

/** Requires valid Supabase session for an allowlisted admin email. */
export async function requireAdminKey(req, res) {
  if (hasAdminKey(req)) return true;
  const token = extractBearerToken(req);
  if (!token) return sendUnauthorized(res);
  try {
    const supabase = getSupabaseAuthClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user?.email) return sendUnauthorized(res, 'Invalid or expired session');
    if (!isAdminEmail(user.email)) return sendForbidden(res);
    return true;
  } catch {
    return sendUnauthorized(res);
  }
}

/** Admin JWT or scoped fulfillment order token. */
export async function requireAdminOrOrderToken(req, res) {
  if (hasAdminKey(req)) return true;
  const admin = await verifyAdminUser(req);
  if (admin) return true;

  const orderId = extractOrderId(req);
  const token = extractOrderToken(req);
  if (orderId && verifyOrderToken(orderId, token)) return true;

  return sendUnauthorized(res);
}

/** Vercel cron secret or admin JWT. */
export async function requireCronOrAdminKey(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = String(
      req.headers['x-cron-secret']
      || req.headers['authorization']?.replace(/^Bearer\s+/i, '')
      || '',
    ).trim();
    if (provided && safeEqual(provided, cronSecret)) return true;
  }
  return requireAdminKey(req, res);
}
