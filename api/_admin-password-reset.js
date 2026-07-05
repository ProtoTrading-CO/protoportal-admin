import { createHmac, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isAdminEmail } from './_admin-auth.js';
import { sendOutgoing } from './_outgoing-email.js';

export function getResetSecret() {
  return process.env.ADMIN_RESET_TOKEN_SECRET
    || process.env.RESET_TOKEN_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function makeResetToken(email, secret, ttlMs = 3600000) {
  const payload = Buffer.from(JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Date.now() + ttlMs,
    scope: 'admin',
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyResetToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid reset link');
  const [payload, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig !== expectedSig) throw new Error('Invalid reset link');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.scope !== 'admin') throw new Error('Invalid reset link');
  if (Date.now() > Number(data.exp || 0)) throw new Error('Reset link has expired. Request a new one.');
  const email = String(data.email || '').trim().toLowerCase();
  if (!isAdminEmail(email)) throw new Error('This reset link is not valid for admin access');
  return email;
}

export function getAdminAuthClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function findAdminAuthUser(supabase, email) {
  const target = String(email || '').trim().toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = (data?.users || []).find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (!data?.users?.length || data.users.length < 200) break;
    page += 1;
  }
  return null;
}

export async function ensureAdminAuthUser(supabase, email) {
  const existing = await findAdminAuthUser(supabase, email);
  if (existing) return existing;
  const tempPassword = randomBytes(24).toString('base64url');
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: email.split('@')[0] },
  });
  if (error) throw error;
  return data.user;
}

export async function sendAdminResetEmail(email, link) {
  await sendOutgoing('admin_password_reset', {
    to: { email },
    vars: { reset_link: link },
  });
}
