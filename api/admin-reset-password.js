import { getAdminAuthClient, getResetSecret, verifyResetToken, findAdminAuthUser } from './_admin-password-reset.js';

/** Complete admin password reset from emailed token link. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const secret = getResetSecret();
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

  let email;
  try {
    email = verifyResetToken(token, secret);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const supabase = getAdminAuthClient();
    const user = await findAdminAuthUser(supabase, email);
    if (!user) return res.status(404).json({ error: 'Admin account not found' });

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin-reset-password:', err.message);
    return res.status(500).json({ error: err.message || 'Password reset failed' });
  }
}
