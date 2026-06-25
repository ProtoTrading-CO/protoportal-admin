const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function lookupProtoActiveByEmail(supabase, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await supabase
    .from('proto_active_customers')
    .select('account_code, name, contact_name, first_name, sales_last_12_months, invoice_count, last_purchase_date')
    .ilike('email', normalized)
    .maybeSingle();
  return data || null;
}

export async function allocateCustomerCode(supabase, preferredCode = null) {
  const preferred = String(preferredCode || '').trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(preferred)) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .ilike('customer_code', preferred)
      .maybeSingle();
    if (!data) return preferred;
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    const { data } = await supabase
      .from('customers')
      .select('id')
      .ilike('customer_code', code)
      .maybeSingle();
    if (!data) return code;
  }

  throw new Error('Could not allocate a unique customer code — please try again');
}

export async function sendWelcomeWhatsapp(customer) {
  if (customer?.accept_whatsapp === false || !customer?.phone) return;
  const rawPhone = String(customer.phone).replace(/\D/g, '');
  if (!rawPhone) return;
  const watiPhone = rawPhone.startsWith('0') ? `27${rawPhone.slice(1)}` : rawPhone;
  const watiBase = process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950';
  const watiToken = process.env.WATI_API_TOKEN;
  if (!watiToken) return;

  try {
    await fetch(`${watiBase}/api/v1/addContact`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customer.name || customer.business_name || 'Customer',
        phoneNumber: watiPhone,
      }),
    }).catch(() => {});

    const waRes = await fetch(
      `${watiBase}/api/v1/sendTemplateMessage?whatsappNumber=${watiPhone}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${watiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: 'proto_welcome_',
          broadcast_name: 'proto_welcome_',
          parameters: [],
        }),
      },
    );
    if (!waRes.ok) {
      const waBody = await waRes.json().catch(() => ({}));
      console.error('WATI send error:', waRes.status, JSON.stringify(waBody));
    }
  } catch (err) {
    console.error('WATI broadcast error:', err?.message || err);
  }
}
