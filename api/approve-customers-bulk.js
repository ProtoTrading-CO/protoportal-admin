import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

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

/** Bulk-approve customers whose email appears in the uploaded list. */
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
  const approved = [];
  const failed = [];
  const notFound = [];

  for (const email of emails) {
    const { data: customer, error: findErr } = await supabase
      .from('customers')
      .select('id, email, is_approved')
      .eq('email', email)
      .maybeSingle();
    if (findErr) {
      failed.push({ email, error: findErr.message });
      continue;
    }
    if (!customer) {
      notFound.push(email);
      continue;
    }
    if (customer.is_approved) {
      approved.push({ email, id: customer.id, already: true });
      continue;
    }
    const { error } = await supabase
      .from('customers')
      .update({ is_approved: true })
      .eq('id', customer.id);
    if (error) {
      failed.push({ email, error: error.message });
    } else {
      approved.push({ email, id: customer.id });
    }
  }

  return res.status(200).json({
    ok: failed.length === 0,
    approved: approved.filter((a) => !a.already).length,
    alreadyApproved: approved.filter((a) => a.already).length,
    notFound,
    failed,
  });
}
