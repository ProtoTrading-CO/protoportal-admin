import { requireAdminOrOrderToken } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { getPortalAdminClient, SITE_CONFIG_BUCKET } from './_site-config.js';

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

function buildEmailHtml({
  customerName,
  orderNumber,
  orderDate,
  items,
  autoNotes,
  userNotes,
  assignedTo,
  total,
  hasPresaleInvoice,
}) {
  const dateStr = orderDate
    ? new Date(orderDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const hasPrice = items.some((item) => item.unitPrice && !item.removed);
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
          ${hasPrice ? '<td style="padding:10px 12px;text-align:right;color:#94a3b8">—</td>' : ''}
        </tr>`;
    }
    const qtyChanged = item.originalQty != null && item.qty !== item.originalQty;
    const lineTotal = item.unitPrice ? (item.qty * item.unitPrice).toFixed(2) : null;
    return `
      <tr style="background:${qtyChanged ? '#fffbeb' : 'transparent'};border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px 12px">
          ${imgUrl ? `<img src="${imgUrl}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f3f4f6">` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px"></div>'}
        </td>
        <td style="padding:10px 12px;font-weight:700;font-size:12px;color:#64748b">${escapeHtml(item.code, '—')}</td>
        <td style="padding:10px 12px;font-size:13px">
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
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">

  <div style="background:#0f172a;padding:28px 32px">
    <div style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Proto Trading</div>
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800">Order Confirmation</h1>
    <div style="color:#94a3b8;font-size:13px;margin-top:6px">${escapeHtml(orderNumber)}${dateStr ? ` &nbsp;·&nbsp; ${dateStr}` : ''}</div>
  </div>

  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">Hi <strong>${escapeHtml(customerName, 'there')}</strong>,</p>
    <p style="color:#374151;font-size:14px;margin:0 0 24px;line-height:1.6">
      Thank you for your order. Your confirmed order summary is below, and we have attached your
      <strong>order confirmation PDF</strong>${hasPresaleInvoice ? ' together with your <strong>presale invoice</strong>' : ''}.
      ${items.some((i) => i.removed) ? '<br><span style="color:#dc2626;font-weight:700">Items marked OUT OF STOCK are not included in your confirmed order.</span>' : ''}
      ${items.some((i) => !i.removed && i.originalQty != null && i.qty !== i.originalQty) ? '<br><span style="color:#92400e;font-weight:700">Items marked QTY CHANGED have been adjusted from your original order.</span>' : ''}
    </p>

    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;width:60px">Img</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Code</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Ordered</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Confirmed</th>
          ${hasPrice ? '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Total</th>' : ''}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${total != null ? `
    <div style="margin-top:16px;padding:14px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:14px;font-weight:700;color:#374151">Total (excl. VAT)</span>
      <span style="font-size:20px;font-weight:900;color:#0f172a">R ${Number(total).toFixed(2)}</span>
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

    <div style="margin-top:24px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;color:#166534;line-height:1.5">
      <strong>Attachments</strong><br>
      • Order confirmation (PDF)${hasPresaleInvoice ? '<br>• Presale invoice' : ''}
    </div>

    <p style="margin:32px 0 0;font-size:14px;color:#374151;line-height:1.6">
      Thank you for choosing Proto Trading. If you have any questions, please reply to this email.
    </p>
  </div>

  <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
    <div style="font-size:12px;color:#94a3b8">Proto Trading · South Africa</div>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (!requireAdminOrOrderToken(req, res)) return;
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
    pdfBase64,
    pdfFilename,
  } = req.body || {};

  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required.' });

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured (BREVO_API_KEY).' });
  }

  if (!pdfBase64) {
    return res.status(400).json({ error: 'Order confirmation PDF is required.' });
  }

  const presaleAttachment = await loadPresaleAttachment(orderId);
  const attachments = [
    {
      name: pdfFilename || `proto-order-confirmation-${orderNumber || orderId || 'order'}.pdf`,
      content: pdfBase64,
    },
  ];
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

  return res.status(200).json({
    ok: true,
    attachments: attachments.map((a) => a.name),
    presaleIncluded: Boolean(presaleAttachment),
  });
}
