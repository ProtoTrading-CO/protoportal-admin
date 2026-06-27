import { isAdminEmail } from './_admin-auth.js';
import {
  ensureAdminAuthUser,
  getAdminAuthClient,
  getResetSecret,
  makeResetToken,
  sendAdminResetEmail,
} from './_admin-password-reset.js';

/** Send admin password reset via Brevo (Supabase built-in email is not used). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  if (!isAdminEmail(email)) {
    return res.status(403).json({ error: 'This email is not authorized for the admin dashboard.' });
  }

  const secret = getResetSecret();
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

  try {
    const supabase = getAdminAuthClient();
    await ensureAdminAuthUser(supabase, email);

    const token = makeResetToken(email, secret);
    const adminUrl = (process.env.ADMIN_PORTAL_URL || 'https://protoportal-admin.vercel.app').replace(/\/$/, '');
    const resetLink = `${adminUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await sendAdminResetEmail(email, resetLink);

    return res.status(200).json({ ok: true, message: 'Reset link sent.' });
  } catch (err) {
    console.error('admin-forgot-password:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to send reset email' });
  }
}
