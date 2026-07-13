import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { runInChunks } from '../lib/bulk-chunk.mjs';
import { sendWelcomeApprovalEmail } from './_welcome-email.js';

// Approvals are cheap DB writes — do them in wide chunks. Emails hit Brevo, so
// keep concurrency low to stay under the provider's transactional rate limit.
const APPROVE_UPDATE_CHUNK = 100;
const EMAIL_CONCURRENCY = 5;

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function fetchCustomersByEmails(supabase, emails) {
  const map = new Map();
  const CHUNK = 100;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const slice = emails.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, is_approved, customer_code, name, business_name, last_email_type')
      .in('email', slice);
    if (error) throw error;
    for (const row of data || []) {
      map.set(normalizeEmail(row.email), row);
    }
  }
  return map;
}

/**
 * Bulk-approve customers whose email appears in the uploaded list.
 *
 * Approval (a fast DB write) is decoupled from the approval email (a Brevo
 * call): we approve everyone first so a slow/large email run can never leave
 * the approvals half-applied or lost to a function timeout. Emails then go to
 * the customers approved IN THIS request only — never re-emailing already
 * approved customers — and every send outcome is surfaced in the response.
 */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const emails = [...new Set(
    (Array.isArray(req.body?.emails) ? req.body.emails : [])
      .map(normalizeEmail)
      .filter(Boolean),
  )];
  if (!emails.length) return res.status(400).json({ error: 'No valid email addresses provided' });

  const supabase = getAdminClient();

  try {
    const customerMap = await fetchCustomersByEmails(supabase, emails);
    const notFound = [];
    const requested = [];
    for (const email of emails) {
      const customer = customerMap.get(email);
      if (!customer) { notFound.push(email); continue; }
      requested.push(customer);
    }

    const alreadyApproved = requested.filter((c) => c.is_approved).length;
    const toApprove = requested.filter((c) => !c.is_approved);

    // 1. Approve everyone not yet approved — fast, chunked bulk UPDATEs.
    const approveFailedIds = new Set();
    const approveIds = toApprove.map((c) => c.id);
    for (let i = 0; i < approveIds.length; i += APPROVE_UPDATE_CHUNK) {
      const chunk = approveIds.slice(i, i + APPROVE_UPDATE_CHUNK);
      const { error } = await supabase.from('customers').update({ is_approved: true }).in('id', chunk);
      if (error) chunk.forEach((id) => approveFailedIds.add(id));
    }
    const approvedNow = toApprove.filter((c) => !approveFailedIds.has(c.id));

    // 2. Approval email — only for customers approved in THIS request, and only
    //    if they haven't already had the welcome/approval email (so a re-run
    //    never double-sends). Best-effort with bounded concurrency.
    const emailTargets = approvedNow.filter((c) => c.last_email_type !== 'welcome');
    let emailed = 0;
    const emailFailed = [];
    await runInChunks(emailTargets, EMAIL_CONCURRENCY, async (customer) => {
      try {
        const result = await sendWelcomeApprovalEmail(customer, { supabase });
        if (result?.sent) emailed += 1;
        else emailFailed.push(customer.email);
      } catch (err) {
        console.error('bulk approve email error:', customer.email, err.message);
        emailFailed.push(customer.email);
      }
      return null;
    });

    return res.status(200).json({
      ok: approveFailedIds.size === 0,
      approved: approvedNow.length,
      alreadyApproved,
      emailed,
      emailFailed,
      notFound,
      failed: [...approveFailedIds].map((id) => ({ id, error: 'approve failed' })),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Bulk approve failed' });
  }
}
