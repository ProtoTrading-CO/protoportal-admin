import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const supabase = getAdminClient();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError) {
    if (createError.code === 'email_exists') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    return res.status(400).json({ error: createError.message || 'Failed to create account' });
  }

  const user = created?.user;
  if (!user?.id) {
    return res.status(500).json({ error: 'Account was created without a user id' });
  }

  const customerRow = {
    id: user.id,
    email,
    name,
    tier: 'regular',
    role: 'customer',
    is_approved: false,
    business_name: name,
  };

  const { error: customerError } = await supabase
    .from('customers')
    .upsert(customerRow, { onConflict: 'id' });

  if (customerError) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => {});
    return res.status(400).json({ error: customerError.message || 'Failed to create customer profile' });
  }

  return res.status(200).json({
    ok: true,
    message: 'Account created successfully',
    userId: user.id,
  });
}
