import { requireTradeRegisterOrAdmin } from './_admin-auth.js';
import { sendOutgoing } from './_outgoing-email.js';
import { buildCustomerPasswordResetVars } from '../lib/outgoing-emails.mjs';

/**
 * Send trade customer password reset email (Brevo).
 * Called by register.proto.co.za / site.proto.co.za after generating a reset link.
 *
 * POST { email, resetLink, name? }
 * Auth: x-trade-register-secret or admin JWT
 */
export default async function handler(req, res) {
  if (!(await requireTradeRegisterOrAdmin(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email || '').trim().toLowerCase();
  const resetLink = String(req.body?.resetLink || req.body?.reset_link || '').trim();
  const name = String(req.body?.name || '').trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  if (!resetLink) {
    return res.status(400).json({ error: 'resetLink is required' });
  }

  if (!process.env.BREVO_API_KEY) {
    return res.status(503).json({ error: 'BREVO_API_KEY is not configured' });
  }

  try {
    const vars = buildCustomerPasswordResetVars({ email, name, resetLink });
    await sendOutgoing('customer_password_reset', {
      to: { email, name: vars.name || email },
      vars,
    });
    return res.status(200).json({ ok: true, sent: true, email });
  } catch (err) {
    console.error('customer-password-reset-email:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Failed to send password reset email' });
  }
}
