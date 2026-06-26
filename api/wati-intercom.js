import { createClient } from '@supabase/supabase-js';
import { fetchAllWatiContacts, fetchCustomerPhoneMap, mapCustomParams, normalizePhone, watiRequest } from './_wati.js';

const INTERCOM_API = 'https://api.intercom.io';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function intercomReq(path, method = 'GET', body = null) {
  const res = await fetch(`${INTERCOM_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function findOrCreateIntercomContact(phone, name) {
  const search = await intercomReq('/contacts/search', 'POST', {
    query: { field: 'phone', operator: '=', value: phone },
  });
  if (search.data?.length > 0) return search.data[0];
  return intercomReq('/contacts', 'POST', {
    role: 'user',
    phone,
    name: name || 'WhatsApp Customer',
    external_id: phone,
  });
}

async function sendWatiMessage(phone, text) {
  const base = (process.env.WATI_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/sendSessionMessage/${phone}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message_text: text }),
  });
  return res.json();
}

async function updateJoinStatus(phone, status) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const [watiContacts, customerMap] = await Promise.all([
    fetchAllWatiContacts(),
    fetchCustomerPhoneMap(),
  ]);

  const existing = watiContacts.find((contact) => normalizePhone(contact.phone || contact.wAid || contact.waId || contact.rcsPhone || '') === normalizedPhone) || {};
  const customer = customerMap.get(normalizedPhone);
  const existingParams = mapCustomParams(existing);
  const customParams = {
    ...existingParams,
    attribute_2: status,
    joined: status,
    join_status: status,
    join_status_text: status,
    business_type: existingParams.business_type || customer?.business_type || '',
    customer_email: existingParams.customer_email || customer?.email || '',
  };

  await watiRequest(`/api/v1/addContact/${normalizedPhone}`, {
    method: 'POST',
    body: {
      name: existing.fullName || existing.firstName || customer?.name || customer?.business_name || 'Customer',
      phoneNumber: normalizedPhone,
      customParams: Object.entries(customParams)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([name, value]) => ({ name, value: String(value) })),
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  // Require WEBHOOK_SECRET — configure ?secret=... on the WATI dashboard webhook URL.
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (String(req.query?.secret || '') !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const p = req.body || {};

  // Normalise across WATI payload shapes
  const phone =
    p.waId ||
    p.from ||
    p.contact?.phone ||
    p.contacts?.[0]?.wa_id ||
    '';
  const text =
    (typeof p.text === 'string' ? p.text : '') ||
    p.message?.text?.body ||
    p.messages?.[0]?.text?.body ||
    p.text?.body ||
    p.buttonText ||
    p.buttonReply?.text ||
    p.button_reply?.title ||
    p.interactive?.button_reply?.title ||
    p.interactive?.button_reply?.text ||
    p.responseButton?.text ||
    '';
  const name =
    p.senderName ||
    p.contact?.name ||
    p.contacts?.[0]?.profile?.name ||
    'WhatsApp Customer';

  console.log('Parsed — phone:', phone, '| text:', text);

  if (!phone || !text) return res.status(200).json({ ok: true, debug: 'missing phone or text', phone, text });

  const normalizedText = String(text || '').trim().toLowerCase();
  if (['join us', 'join us.', 'join'].includes(normalizedText)) {
    await updateJoinStatus(phone, 'joined');
    return res.status(200).json({ ok: true, joinStatus: 'joined' });
  }
  if (['no thanks', 'no thanks.', 'not interested'].includes(normalizedText)) {
    await updateJoinStatus(phone, 'no thanks');
    return res.status(200).json({ ok: true, joinStatus: 'no thanks' });
  }

  const supabase = getAdminClient();
  const isTrigger = normalizedText.includes('customer service');

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select()
    .eq('phone', phone)
    .maybeSingle();

  if (!isTrigger && !session) {
    // Not triggered and no active session — ignore
    return res.status(200).json({ ok: true });
  }

  if (session) {
    // Try to forward to existing Intercom conversation
    const replyRes = await intercomReq(`/conversations/${session.intercom_conversation_id}/reply`, 'POST', {
      message_type: 'comment',
      type: 'user',
      intercom_user_id: session.intercom_contact_id,
      body: text,
    });
    console.log('Intercom reply result:', JSON.stringify(replyRes));

    if (replyRes?.type === 'error.list') {
      // Stale session — delete it and fall through to create a new one
      console.log('Stale session detected, clearing and recreating');
      await supabase.from('whatsapp_sessions').delete().eq('phone', phone);
    } else {
      await supabase.from('whatsapp_sessions').update({ last_message_at: new Date().toISOString() }).eq('phone', phone);
      return res.status(200).json({ ok: true });
    }
  }

  // New session (or stale session just cleared above)
  const e164 = phone.startsWith('+') ? phone : `+${phone}`;
  const contact = await findOrCreateIntercomContact(e164, name);
  console.log('Intercom contact:', JSON.stringify(contact));
  const contactId = contact.id;

  if (!contactId) {
    console.log('Failed to get Intercom contact ID');
    return res.status(200).json({ ok: true, error: 'intercom_contact_failed' });
  }

  const conversation = await intercomReq('/conversations', 'POST', {
    from: { type: 'contact', id: contactId },
    body: text,
  });
  console.log('Intercom conversation:', JSON.stringify(conversation));
  const conversationId = conversation.id || conversation.conversation_id;

  if (!conversationId) {
    console.log('Failed to get Intercom conversation ID');
    return res.status(200).json({ ok: true, error: 'intercom_conversation_failed' });
  }

  const { error: dbErr } = await supabase.from('whatsapp_sessions').upsert({
    phone,
    intercom_conversation_id: String(conversationId),
    intercom_contact_id: contactId,
    last_message_at: new Date().toISOString(),
  });
  console.log('Supabase upsert error:', dbErr);

  const watiRes = await sendWatiMessage(
    phone,
    "Hi! You're now connected with our customer service team. Our AI assistant will reply here on WhatsApp shortly. 🤝"
  );
  console.log('WATI send result:', JSON.stringify(watiRes));

  return res.status(200).json({ ok: true });
}
