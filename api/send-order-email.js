import { requireAdminOrOrderToken } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { getPortalAdminClient, SITE_CONFIG_BUCKET } from './_site-config.js';
import { CUSTOMER_SEND_FORBIDDEN, isVictorSender } from './_fulfillment-auth.js';
import { markOrderConfirmationSent } from './_order-confirmation-sent.js';
import {
  customerDetailRows,
  deriveAutoNotesFromItems,
} from './_order-format.js';
import { composeOutgoingParts } from './_brevo-email.js';
import { loadOutgoingTemplate, mergeOutgoingTemplate } from './_outgoing-email.js';
import {
  buildOrderConfirmationMergeVars,
  buildOrderEmailHtml,
} from '../lib/order-confirmation-email.mjs';

async function markConfirmationSent(orderId) {
  return markOrderConfirmationSent(orderId);
}

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function loadPresaleAttachment(orderId) {
  if (!orderId) return null;
  const supabase = getPortalAdminClient();
  const metaPath = `orders/presale/${orderId}.json`;
  const { data: metaBlob, error: metaError } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(metaPath);
  if (metaError) return null;
  const meta = JSON.parse(await metaBlob.text());
  const { data: fileBlob, error: fileError } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(meta.storagePath);
  if (fileError) return null;
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  return {
    name: meta.filename || `presale-invoice-${orderId}.pdf`,
    content: buffer.toString('base64'),
  };
}

async function loadConfirmationAttachment(storagePath, name) {
  if (!storagePath) return null;
  const supabase = getPortalAdminClient();
  const { data, error } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(storagePath);
  if (error) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { name, content: buffer.toString('base64') };
}

export default async function handler(req, res) {
  if (!(await requireAdminOrOrderToken(req, res))) return;
  if (req.method !== 'POST') return res.status(405).end();

  const {
    to,
    orderId,
    customerName,
    orderNumber,
    orderDate,
    items = [],
    autoNotes: autoNotesBody,
    userNotes,
    customerNotes: bodyCustomerNotes,
    assignedTo,
    total,
    hasPrices = false,
    pdfBase64,
    pdfFilename,
    confirmationStoragePath,
    senderUserId,
    senderName,
    deliveryMethod: bodyDeliveryMethod,
  } = req.body || {};

  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required.' });

  if (!isVictorSender({ userId: senderUserId, name: senderName })) {
    return res.status(403).json({ error: CUSTOMER_SEND_FORBIDDEN });
  }

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured (BREVO_API_KEY).' });
  }

  const confirmationName = pdfFilename || `proto-order-confirmation-${orderNumber || orderId || 'order'}.pdf`;

  let confirmationAttachment = await loadConfirmationAttachment(confirmationStoragePath, confirmationName);
  if (!confirmationAttachment && pdfBase64) {
    confirmationAttachment = { name: confirmationName, content: pdfBase64 };
  }
  if (!confirmationAttachment) {
    return res.status(400).json({ error: 'Order confirmation PDF is required.' });
  }

  const presaleAttachment = await loadPresaleAttachment(orderId);
  const attachments = [confirmationAttachment];
  if (presaleAttachment) attachments.push(presaleAttachment);

  let orderRow = null;
  if (orderId) {
    const supabase = getAdminClient();
    const { data } = await supabase
      .from('orders')
      .select('*, customers(name, contact_name, email, phone, business_name, business_type, city, province, country, company_address, delivery_address, vat_number, customer_code, tier)')
      .eq('id', orderId)
      .maybeSingle();
    orderRow = data;
  }

  const resolvedCustomerName = orderRow?.customers?.contact_name || orderRow?.customers?.name || customerName;
  const mergeVars = buildOrderConfirmationMergeVars({
    customerName: resolvedCustomerName,
    orderNumber,
    orderRow,
    to,
  });
  let template;
  try {
    template = await loadOutgoingTemplate('order_confirmation_customer');
  } catch (err) {
    console.error('send-order-email: template load failed, using defaults', err?.message || err);
    template = mergeOutgoingTemplate('order_confirmation_customer', {});
  }
  const { subject, introHtml } = composeOutgoingParts(template, mergeVars);

  const autoNotes = autoNotesBody || deriveAutoNotesFromItems(items).join('\n');
  const customerDetails = customerDetailRows({
    ...(orderRow || {}),
    delivery_method: orderRow?.delivery_method || bodyDeliveryMethod,
    customers: orderRow?.customers || { name: customerName, email: to },
  });

  const html = buildOrderEmailHtml({
    customerName: resolvedCustomerName,
    orderNumber: mergeVars.order_number || orderNumber,
    orderDate: orderDate || orderRow?.created_at,
    items,
    autoNotes,
    userNotes,
    customerNotes: orderRow?.customer_notes || bodyCustomerNotes || '',
    assignedTo,
    total,
    hasPrices,
    hasPresaleInvoice: Boolean(presaleAttachment),
    customerDetails,
    introHtml,
  });

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'Proto Trading', email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za' },
      to: [{ email: to }],
      subject: subject.trim(),
      htmlContent: html,
      attachment: attachments,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    return res.status(502).json({ error: body.message || 'Email could not be sent' });
  }

  if (orderId) {
    try {
      await markConfirmationSent(orderId);
    } catch (err) {
      console.error('send-order-email: failed to mark confirmation sent:', err.message);
    }
  }

  return res.status(200).json({
    ok: true,
    attachments: attachments.map((a) => a.name),
    presaleIncluded: Boolean(presaleAttachment),
  });
}
