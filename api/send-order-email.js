import { requireAdminOrOrderToken } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { getPortalAdminClient, SITE_CONFIG_BUCKET, writeSiteConfigJson } from './_site-config.js';
import { CUSTOMER_SEND_FORBIDDEN, isVictorSender } from './_fulfillment-auth.js';

async function markConfirmationSent(orderId) {
  const meta = { orderId, sentAt: new Date().toISOString() };
  await writeSiteConfigJson(`orders/confirmation/${orderId}.json`, meta);
  return meta;
}

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function escapeHtml(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImageUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:') return '';
    return escapeHtml(parsed.href);
  } catch {
    return '';
  }
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

/** Download the order confirmation PDF the browser uploaded via signed URL. */
async function loadConfirmationAttachment(storagePath, name) {
  if (!storagePath) return null;
  const supabase = getPortalAdminClient();
  const { data, error } = await supabase.storage.from(SITE_CONFIG_BUCKET).download(storagePath);
  if (error) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return { name, content: buffer.toString('base64') };
}

function buildEmailHtml({
  customerName,
  orderNumber,
  orderDate,
  items,
  autoNotes,
  userNotes,
  assignedTo,
  total,
  hasPrices = false,
  hasPresaleInvoice,
}) {
  const dateStr = orderDate
    ? new Date(orderDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const showPrices = hasPrices && items.some((item) => !item.removed);
  const allNotes = [autoNotes, userNotes].filter(Boolean).join('\n\n');

  const itemRows = items.map((item) => {
    const imgUrl = safeImageUrl(item.image);
    if (item.removed) {
      return `
        <tr style="background:#fff5f5;border-bottom:1px solid #fee2e2;">
          <td style="padding:8px 12px">
            ${imgUrl ? `<img src="${imgUrl}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f3f4f6">` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px"></div>'}
          </td>
          <td style="padding:10px 12px;font-weight:700;font-size:12px;color:#94a3b8;text-decoration:line-through">${escapeHtml(item.code, '—')}</td>
          <td style="padding:10px 12px;font-size:13px;color:#94a3b8;text-decoration:line-through">${escapeHtml(item.name, '—')}</td>
          <td style="padding:10px 12px;text-align:center;font-size:13px;color:#94a3b8;text-decoration:line-through">${item.originalQty ?? item.qty}</td>
          <td style="padding:10px 12px;text-align:center"><span style="font-size:11px;font-weight:700;color:#dc2626;background:#fee2e2;padding:3px 8px;border-radius:4px">OUT OF STOCK</span></td>
          ${showPrices ? '<td style="padding:10px 12px;text-align:right;color:#94a3b8">—</td>' : ''}
        </tr>`;
    }
    const qtyChanged = item.originalQty != null && item.qty !== item.originalQty;
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = showPrices ? (item.qty * unitPrice).toFixed(2) : null;
    return `
      <tr style="background:${qtyChanged ? '#fffbeb' : 'transparent'};border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px 12px">
          ${imgUrl ? `<img src="${imgUrl}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f3f4f6">` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px"></div>'}
        </td>
        <td style="padding:10px 12px;font-weight:700;font-size:12px;color:#666666">${escapeHtml(item.code, '—')}</td>
        <td style="padding:10px 12px;font-size:14px;color:#111111;font-weight:600">
          ${escapeHtml(item.name, '—')}
          ${item.swapped ? '<span style="margin-left:8px;font-size:10px;font-weight:700;color:#2563eb;background:#dbeafe;padding:2px 6px;border-radius:4px">SUBSTITUTED</span>' : ''}
          ${qtyChanged ? '<span style="margin-left:8px;font-size:10px;font-weight:700;color:#92400e;background:#fef3c7;padding:2px 6px;border-radius:4px">QTY CHANGED</span>' : ''}
        </td>
        <td style="padding:10px 12px;text-align:center;font-size:13px;color:#94a3b8">${item.originalQty != null ? item.originalQty : item.qty}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:13px;color:${qtyChanged ? '#92400e' : '#0f172a'}">${item.qty}</td>
        ${lineTotal != null ? `<td style="padding:10px 12px;text-align:right;font-size:13px">R${lineTotal}</td>` : ''}
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order ${escapeHtml(orderNumber)} — Proto Trading</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08)">

  <div style="background:#111111;padding:0">
    <div style="height:4px;background:#c40000"></div>
    <div style="padding:28px 32px 22px">
      <div style="color:#c40000;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">Proto Trading</div>
      <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;line-height:1.2">Order Confirmation</h1>
      <div style="color:#cbd5e1;font-size:13px;margin-top:10px;font-weight:600">${escapeHtml(orderNumber)}${dateStr ? ` · ${dateStr}` : ''}</div>
    </div>
  </div>

  <div style="padding:28px 32px;background:#ffffff">
    <p style="color:#0f172a;font-size:15px;margin:0 0 8px">Hi <strong>${escapeHtml(customerName, 'there')}</strong>,</p>
    <p style="color:#334155;font-size:14px;margin:0 0 24px;line-height:1.65">
      Thank you for your order. Your confirmed summary is below and your
      <strong>order confirmation PDF</strong> is attached${hasPresaleInvoice ? ', together with your <strong>presale invoice</strong>' : ''}.
      ${items.some((i) => i.removed) ? '<br><span style="display:inline-block;margin-top:10px;color:#dc2626;font-weight:700;font-size:13px">Items marked OUT OF STOCK are not included in your confirmed order.</span>' : ''}
      ${items.some((i) => !i.removed && i.originalQty != null && i.qty !== i.originalQty) ? '<br><span style="display:inline-block;margin-top:8px;color:#92400e;font-weight:700;font-size:13px">Items marked QTY CHANGED have been adjusted from your original order.</span>' : ''}
    </p>

    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <thead>
        <tr>
          <th style="padding:11px 12px;text-align:left;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;width:60px;background:#111111;border-bottom:2px solid #c40000">Img</th>
          <th style="padding:11px 12px;text-align:left;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;background:#111111;border-bottom:2px solid #c40000">Code</th>
          <th style="padding:11px 12px;text-align:left;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;background:#111111;border-bottom:2px solid #c40000">Product</th>
          <th style="padding:11px 12px;text-align:center;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;background:#111111;border-bottom:2px solid #c40000">Ordered</th>
          <th style="padding:11px 12px;text-align:center;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;background:#c40000;border-bottom:2px solid #c40000">Confirmed</th>
          ${showPrices ? '<th style="padding:11px 12px;text-align:right;font-size:10px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;background:#111111;border-bottom:2px solid #c40000">Total</th>' : ''}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${showPrices && total != null ? `
    <div style="margin-top:16px;padding:14px 12px;background:#fafafa;border-radius:8px;border:1px solid #e5e5e5;border-left:4px solid #c40000;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:700;color:#111111">Total (incl. VAT)</span>
      <span style="font-size:20px;font-weight:900;color:#c40000">R ${Number(total).toFixed(2)}</span>
    </div>` : ''}

    ${allNotes ? `
    <div style="margin-top:24px;padding:14px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #0f172a">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Order Notes</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${escapeHtml(allNotes)}</div>
    </div>` : ''}

    ${assignedTo ? `
    <div style="margin-top:16px;font-size:12px;color:#94a3b8">
      Handled by: <strong style="color:#374151">${escapeHtml(assignedTo)}</strong>
    </div>` : ''}

    <div style="margin-top:20px;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;font-size:13px;color:#9a3412;line-height:1.55">
      <strong style="display:block;margin-bottom:4px;color:#7c2d12">Attachments</strong>
      Order confirmation (PDF)${hasPresaleInvoice ? ' · Presale invoice' : ''}
    </div>

    <p style="margin:28px 0 0;font-size:14px;color:#475569;line-height:1.65">
      Thank you for choosing Proto Trading. Reply to this email if you have any questions.
    </p>
  </div>

  <div style="padding:22px 32px;background:#0f172a;text-align:center">
    <div style="font-size:13px;color:#ffffff;font-weight:700">Proto Trading · South Africa</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:6px">online@proto.co.za</div>
  </div>
</div>
</body>
</html>`;
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
    autoNotes,
    userNotes,
    assignedTo,
    total,
    hasPrices = false,
    pdfBase64,
    pdfFilename,
    confirmationStoragePath,
    senderUserId,
    senderName,
  } = req.body || {};

  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required.' });

  if (!isVictorSender({ userId: senderUserId, name: senderName })) {
    return res.status(403).json({ error: CUSTOMER_SEND_FORBIDDEN });
  }

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured (BREVO_API_KEY).' });
  }

  const confirmationName = pdfFilename || `proto-order-confirmation-${orderNumber || orderId || 'order'}.pdf`;

  // Prefer the PDF uploaded to storage via signed URL (no request-size limit).
  // Fall back to inlined base64 for older clients.
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

  const html = buildEmailHtml({
    customerName,
    orderNumber,
    orderDate,
    items,
    autoNotes,
    userNotes,
    assignedTo,
    total,
    hasPrices,
    hasPresaleInvoice: Boolean(presaleAttachment),
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
      subject: `Your Order Confirmation ${orderNumber || ''} — Proto Trading`.trim(),
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
