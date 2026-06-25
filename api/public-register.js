import { createClient } from '@supabase/supabase-js';
import {
  allocateCustomerCode,
  lookupProtoActiveByEmail,
  sendWelcomeWhatsapp,
} from './_customer-onboard.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function cleanString(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function splitFirstName(contactName) {
  const parts = cleanString(contactName, 120).split(/\s+/).filter(Boolean);
  return parts[0] || '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  // Honeypot — bots only
  if (cleanString(body.company_fax)) {
    return res.status(200).json({ ok: true, message: 'Registration received' });
  }

  const email = cleanString(body.email, 200).toLowerCase();
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || body.confirm_password || '');
  const name = cleanString(body.name, 120);
  const businessName = cleanString(body.business_name || body.businessName, 200) || name;
  const businessType = cleanString(body.business_type || body.businessType, 120);
  const phone = cleanString(body.phone, 40);
  const country = cleanString(body.country, 80) || 'South Africa';
  const province = cleanString(body.province, 80);
  const city = cleanString(body.city, 80);
  const companyAddress = cleanString(body.company_address || body.companyAddress, 500);
  const deliveryAddress = cleanString(body.delivery_address || body.deliveryAddress, 500) || companyAddress;
  const vatNumber = cleanString(body.vat_number || body.vatNumber, 40);
  const monthlySpend = cleanString(body.monthly_spend || body.monthlySpend, 80);
  const website = cleanString(body.website, 300);
  const acceptWhatsapp = body.accept_whatsapp !== false && body.acceptWhatsapp !== false;

  if (!email || !password || !name || !businessName || !businessType || !phone || !province || !city || !companyAddress) {
    return res.status(400).json({ error: 'Please complete all required fields' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return res.status(400).json({ error: 'Enter a valid mobile number' });
  }

  const supabase = getAdminClient();

  const { data: existingProfile } = await supabase
    .from('customers')
    .select('id, is_approved')
    .ilike('email', email)
    .maybeSingle();

  if (existingProfile?.id) {
    return res.status(409).json({
      error: existingProfile.is_approved
        ? 'An account with this email already exists — sign in on the trade portal'
        : 'A registration with this email is already pending — contact Proto Trading',
    });
  }

  const protoActive = await lookupProtoActiveByEmail(supabase, email);

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      business_name: businessName,
    },
  });

  if (createError) {
    if (createError.code === 'email_exists') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    return res.status(400).json({ error: createError.message || 'Failed to create account' });
  }

  const user = created?.user;
  if (!user?.id) {
    return res.status(500).json({ error: 'Account was created without a user id' });
  }

  let customerCode;
  try {
    customerCode = await allocateCustomerCode(supabase, protoActive?.account_code);
  } catch (err) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => {});
    return res.status(500).json({ error: err.message || 'Failed to allocate customer code' });
  }

  const firstName = protoActive?.first_name || splitFirstName(name);
  const contactName = protoActive?.contact_name || name;

  const customerRow = {
    id: user.id,
    email,
    name,
    contact_name: contactName,
    first_name: firstName,
    tier: 'regular',
    role: 'customer',
    is_approved: true,
    customer_code: customerCode,
    business_name: businessName,
    business_type: businessType,
    phone,
    country,
    province,
    city,
    company_address: companyAddress,
    delivery_address: deliveryAddress,
    vat_number: vatNumber || null,
    monthly_spend: monthlySpend || null,
    website: website || null,
    accept_whatsapp: acceptWhatsapp,
    sales_last_12_months: protoActive?.sales_last_12_months ?? null,
    invoice_count: protoActive?.invoice_count ?? null,
    last_purchase_date: protoActive?.last_purchase_date ?? null,
  };

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert(customerRow, { onConflict: 'id' })
    .select('*')
    .single();

  if (customerError) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => {});
    return res.status(400).json({ error: customerError.message || 'Failed to save customer profile' });
  }

  await sendWelcomeWhatsapp(customer);

  return res.status(200).json({
    ok: true,
    message: 'Your trade account is approved — you can sign in now',
    customerCode,
    portalUrl: 'https://protoportal-main.vercel.app',
  });
}
