import { createHmac, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isAdminEmail } from './_admin-auth.js';

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

export function adminResetEmailHtml(link) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Reset Proto Admin password</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;background:#dc2626;"></td></tr>
<tr><td style="padding:28px 32px;">
  <h1 style="margin:0 0 8px;font-size:24px;color:#111827;">Proto Admin password reset</h1>
  <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">Click the button below to set a new password for your admin dashboard account. This link expires in 1 hour.</p>
  <p style="margin:0 0 24px;text-align:center;">
    <a href="${link}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;">Set new password</a>
  </p>
  <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">If you did not request this, ignore this email.</p>
  <p style="margin:16px 0 0;word-break:break-all;font-size:12px;color:#9ca3af;">${link}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendAdminResetEmail(email, link) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('Email service is not configured (BREVO_API_KEY).');

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Proto Admin',
        email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
      },
      to: [{ email }],
      subject: 'Reset your Proto Admin password',
      htmlContent: adminResetEmailHtml(link),
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.message || `Brevo send failed (${resp.status})`);
  }
}
