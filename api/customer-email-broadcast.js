import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import {
  fetchCustomerAudience,
  sendBroadcastBatch,
  buildComposedEmail,
  TEST_MERGE_VARS,
  sendBrevoTransactional,
} from './_brevo-email.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const VALID_AUDIENCE = new Set(['requests', 'regular', 'proto-active', 'all-portal', 'all-approved']);

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
  maxDuration: 300,
};

/** Send a Brevo email to portal customers (by tab / audience). */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  if (req.method !== 'POST') return res.status(405).end();

  const {
    audience,
    subject,
    introText,
    htmlBlock,
    htmlContent,
    textContent,
    testEmail,
  } = req.body || {};

  const aud = String(audience || '').trim();
  if (!VALID_AUDIENCE.has(aud)) {
    return res.status(400).json({ error: 'Invalid audience. Use requests, regular, proto-active, all-approved, or all-portal.' });
  }
  const subj = String(subject || '').trim();
  if (!subj) return res.status(400).json({ error: 'Subject is required' });

  const intro = String(introText ?? '').trim();
  const html = String(htmlBlock ?? htmlContent ?? '').trim();
  if (!intro && !html && !textContent) {
    return res.status(400).json({ error: 'Write a message body and/or HTML block.' });
  }

  try {
    const sb = getAdminClient();

    if (testEmail) {
      const to = { email: String(testEmail).trim().toLowerCase(), name: 'Test' };
      const composed = buildComposedEmail(
        { subject: subj, introText: intro, htmlBlock: html },
        TEST_MERGE_VARS,
      );
      await sendBrevoTransactional({
        to,
        subject: `[TEST] ${composed.subject}`,
        htmlContent: composed.htmlContent,
        textContent: composed.textContent || textContent,
      });
      return res.status(200).json({ ok: true, test: true, sent: 1 });
    }

    const recipients = await fetchCustomerAudience(sb, aud);
    if (!recipients.length) {
      return res.status(400).json({ error: 'No customers with valid email addresses in this audience.' });
    }

    const { sent, failed, errors } = await sendBroadcastBatch(recipients, {
      subject: subj,
      introText: intro,
      htmlBlock: html,
    });

    return res.status(failed ? 207 : 200).json({
      ok: failed === 0,
      audience: aud,
      total: recipients.length,
      sent,
      failed,
      errors,
    });
  } catch (err) {
    console.error('customer-email-broadcast:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Broadcast failed' });
  }
}
