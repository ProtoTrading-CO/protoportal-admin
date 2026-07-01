function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapBroadcastHtml({ subject, bodyHtml, previewName = '' }) {
  const safeBody = bodyHtml || '<p>Hello from Proto Trading.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px;">
  ${previewName ? `<p style="margin:0 0 16px;">Hi ${escapeHtml(previewName)},</p>` : ''}
  ${safeBody}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="font-size:12px;color:#6b7280;margin:0;">Proto Trading · <a href="https://site.proto.co.za">site.proto.co.za</a></p>
</body></html>`;
}

export async function sendBrevoTransactional({ to, subject, htmlContent, textContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not configured');

  const payload = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'Proto Trading',
      email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
    },
    to: [{ email: to.email, name: to.name || to.email }],
    subject,
    htmlContent,
  };
  if (textContent) payload.textContent = textContent;

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.message || `Brevo ${resp.status}`);
  return body;
}

async function fetchAllFromTable(sb, table, buildQuery) {
  const pageSize = 500;
  let page = 0;
  const rows = [];
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let q = sb.from(table).select('*').range(from, to);
    if (buildQuery) q = buildQuery(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    page += 1;
    if (page > 200) break;
  }
  return rows;
}

export async function fetchCustomerAudience(sb, audience) {
  const seen = new Map();

  const add = (email, name) => {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@') || seen.has(e)) return;
    seen.set(e, String(name || '').trim() || e.split('@')[0]);
  };

  if (audience === 'requests' || audience === 'regular' || audience === 'all-portal' || audience === 'all-approved') {
    const portalRows = await fetchAllFromTable(sb, 'customers', (q) => {
      if (audience === 'requests') return q.eq('is_approved', false);
      if (audience === 'regular' || audience === 'all-approved' || audience === 'all-portal') {
        return q.eq('is_approved', true);
      }
      return q;
    });
    portalRows.forEach((r) => add(r.email, r.first_name || r.contact_name || r.name || r.business_name));
  }

  if (audience === 'proto-active' || audience === 'all-portal') {
    const protoRows = await fetchAllFromTable(sb, 'proto_active_customers');
    protoRows.forEach((r) => add(r.email, r.first_name || r.contact_name || r.name));
  }

  return [...seen.entries()].map(([email, name]) => ({ email, name }));
}

export async function sendBroadcastBatch(recipients, { subject, htmlContent, textContent, onProgress }) {
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const recipient of recipients) {
    try {
      const html = wrapBroadcastHtml({
        subject,
        bodyHtml: htmlContent,
        previewName: recipient.name,
      });
      await sendBrevoTransactional({
        to: recipient,
        subject,
        htmlContent: html,
        textContent,
      });
      sent += 1;
      if (onProgress) onProgress({ sent, failed, total: recipients.length });
      // Light throttle — Brevo transactional rate limits
      if (sent % 10 === 0) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      failed += 1;
      if (errors.length < 20) errors.push({ email: recipient.email, error: err.message });
    }
  }

  return { sent, failed, errors };
}
