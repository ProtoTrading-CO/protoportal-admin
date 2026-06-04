function buildEmailHtml({ customerName, orderNumber, orderDate, items, notes, assignedTo, total }) {
  const dateStr = orderDate
    ? new Date(orderDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const itemRows = items.map((item) => {
    const qtyChanged = item.originalQty != null && item.qty !== item.originalQty;
    const lineTotal = item.unitPrice ? (item.qty * item.unitPrice).toFixed(2) : null;
    return `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 12px;font-weight:700;font-size:12px;color:#64748b">${item.code || '—'}</td>
        <td style="padding:10px 12px;font-size:13px">${item.name || '—'}</td>
        <td style="padding:10px 12px;text-align:center;font-size:13px;color:#94a3b8">${item.originalQty != null ? item.originalQty : item.qty}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;font-size:13px;background:${qtyChanged ? '#fffbeb' : 'transparent'};color:${qtyChanged ? '#92400e' : '#0f172a'}">${item.qty}${qtyChanged ? ' ✎' : ''}</td>
        ${lineTotal != null ? `<td style="padding:10px 12px;text-align:right;font-size:13px">R${lineTotal}</td>` : ''}
      </tr>`;
  }).join('');

  const hasPrice = items.some((i) => i.unitPrice);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order ${orderNumber} — Proto Trading</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#0f172a;padding:28px 32px">
    <div style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px">Proto Trading</div>
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800">Order Confirmation</h1>
    <div style="color:#94a3b8;font-size:13px;margin-top:6px">${orderNumber}${dateStr ? ` &nbsp;·&nbsp; ${dateStr}` : ''}</div>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">Hi <strong>${customerName || 'there'}</strong>,</p>
    <p style="color:#374151;font-size:14px;margin:0 0 24px;line-height:1.6">
      Thank you for your order. Please find your confirmed order summary below.
      ${items.some((i) => i.originalQty != null && i.qty !== i.originalQty) ? '<br><span style="color:#92400e;font-weight:700">Items marked with ✎ have been adjusted from your original order.</span>' : ''}
    </p>

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
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
    <!-- Total -->
    <div style="display:flex;justify-content:flex-end;margin-top:16px;padding:14px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
      <span style="font-size:14px;font-weight:700;color:#374151;margin-right:16px">Total</span>
      <span style="font-size:20px;font-weight:900;color:#0f172a">R ${total.toFixed(2)}</span>
    </div>` : ''}

    ${notes ? `
    <!-- Notes -->
    <div style="margin-top:24px;padding:14px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #0f172a">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Notes</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${notes}</div>
    </div>` : ''}

    ${assignedTo ? `
    <div style="margin-top:16px;font-size:12px;color:#94a3b8">
      Handled by: <strong style="color:#374151">${assignedTo}</strong>
    </div>` : ''}

    <p style="margin:32px 0 0;font-size:14px;color:#374151;line-height:1.6">
      Thank you for choosing Proto Trading. If you have any questions, please reply to this email.
    </p>
  </div>

  <!-- Footer -->
  <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
    <div style="font-size:12px;color:#94a3b8">Proto Trading · South Africa</div>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, customerName, orderNumber, orderDate, items = [], notes, assignedTo, total } = req.body || {};

  if (!to) return res.status(400).json({ error: 'Recipient email (to) is required.' });

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY to your Vercel environment variables.' });
  }

  const html = buildEmailHtml({ customerName, orderNumber, orderDate, items, notes, assignedTo, total });
  const from = process.env.RESEND_FROM || 'Proto Trading <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Your Order ${orderNumber || ''} — Proto Trading`,
      html,
    }),
  });

  const data = await response.json();
  if (!response.ok) return res.status(400).json({ error: data.message || data.error || 'Failed to send email' });
  return res.status(200).json({ ok: true, id: data.id });
}
