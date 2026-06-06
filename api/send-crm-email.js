export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { recipients = [], subject, body } = req.body || {};

  if (!recipients.length) return res.status(400).json({ error: 'No recipients' });
  if (!subject?.trim()) return res.status(400).json({ error: 'Subject required' });
  if (!body?.trim()) return res.status(400).json({ error: 'Body required' });

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured (BREVO_API_KEY).' });
  }

  let sent = 0;
  const failed = [];

  for (const recipient of recipients) {
    const personalised = body.replace(/\{\{name\}\}/g, recipient.name || 'there');
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e7eb">
  <div style="background:#111827;padding:20px 28px">
    <h1 style="color:#fff;margin:0;font-size:17px;font-weight:700;letter-spacing:0.04em">PROTO <span style="color:#dc2626">TRADING</span></h1>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;font-size:15px;margin:0 0 16px">Hi <strong>${recipient.name || 'there'}</strong>,</p>
    <div style="font-size:14px;color:#374151;line-height:1.8">${personalised.replace(/\n/g, '<br>')}</div>
  </div>
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    Proto Trading · South Africa · <a href="mailto:online@proto.co.za" style="color:#9ca3af">online@proto.co.za</a>
  </div>
</div>
</body>
</html>`;

    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: { name: 'Proto Trading', email: 'online@proto.co.za' },
          to: [{ email: recipient.email, name: recipient.name || '' }],
          subject,
          htmlContent,
        }),
      });
      if (resp.ok) { sent++; }
      else { failed.push(recipient.email); }
    } catch {
      failed.push(recipient.email);
    }
  }

  return res.status(200).json({ ok: true, sent, failed: failed.length, failedList: failed });
}
