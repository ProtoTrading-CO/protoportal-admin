import { PROTO_URLS } from './_proto-urls.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainToHtml(text) {
  return String(text || '')
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      return `<p style="margin:0 0 14px;line-height:1.55;">${lines.map((line) => escapeHtml(line)).join('<br />')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function stripDangerousHtml(html) {
  return String(html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyMergeTags(template, vars = {}) {
  return String(template ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/gi, (_, key) => {
    const value = vars[String(key).toLowerCase()];
    return value != null ? String(value) : '';
  });
}

export function buildRecipientVars(recipient = {}) {
  const business = recipient.business_name || recipient.name || '';
  const contact = recipient.contact_name || recipient.name || recipient.first_name || '';
  const code = recipient.customer_code || recipient.account_code || '';
  return {
    name: contact || business || recipient.email?.split('@')[0] || '',
    first_name: recipient.first_name || '',
    contact_name: contact,
    business_name: business,
    email: recipient.email || '',
    customer_code: code,
    account_code: recipient.account_code || recipient.customer_code || code,
    phone: recipient.phone || '',
  };
}

export const TEST_MERGE_VARS = {
  name: 'Jane Smith',
  first_name: 'Jane',
  contact_name: 'Jane Smith',
  business_name: 'ABC Stationers',
  email: 'jane@abcstationers.co.za',
  customer_code: 'ABC123',
  account_code: 'ABC123',
  phone: '082 555 1234',
};

export function buildComposedEmail({ subject, introText = '', htmlBlock = '' }, vars = {}) {
  const personalizedSubject = applyMergeTags(subject, vars);
  const intro = introText.trim();
  const html = htmlBlock.trim();
  const introHtml = intro ? plainToHtml(applyMergeTags(intro, vars)) : '';
  const htmlPart = html ? stripDangerousHtml(applyMergeTags(html, vars)) : '';
  const bodyHtml = [introHtml, htmlPart].filter(Boolean).join('\n') || '<p></p>';
  const textContent = buildComposedText({ introText, htmlBlock }, vars);
  const htmlContent = wrapBroadcastHtml({ subject: personalizedSubject, bodyHtml });
  return { subject: personalizedSubject, htmlContent, textContent, bodyHtml };
}

export function buildComposedText({ introText = '', htmlBlock = '' }, vars = {}) {
  const parts = [];
  if (introText.trim()) parts.push(applyMergeTags(introText, vars));
  if (htmlBlock.trim()) parts.push(htmlToText(applyMergeTags(htmlBlock, vars)));
  return parts.join('\n\n').trim();
}

export function wrapBroadcastHtml({ subject, bodyHtml }) {
  const safeBody = bodyHtml || '<p>Hello from Proto Trading.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px;">
  ${safeBody}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <div style="text-align:center;margin:0;">
    <a href="${PROTO_URLS.site}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;font-size:14px;">Shop Proto Trading</a>
  </div>
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

function upsertRecipient(seen, row) {
  const email = String(row.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  const prev = seen.get(email) || { email };
  seen.set(email, { ...prev, ...row, email });
}

export async function fetchCustomerAudience(sb, audience, { businessTypes = [] } = {}) {
  const seen = new Map();
  const types = [...new Set((businessTypes || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const matchesBusinessType = (row) => {
    if (!types.length) return true;
    const bt = String(row.business_type || '').trim();
    return types.includes(bt);
  };

  if (audience === 'requests' || audience === 'regular' || audience === 'all-portal' || audience === 'all-approved') {
    const portalRows = await fetchAllFromTable(sb, 'customers', (q) => {
      let query = q;
      if (audience === 'requests') query = query.eq('is_approved', false);
      else if (audience === 'regular' || audience === 'all-approved' || audience === 'all-portal') {
        query = query.eq('is_approved', true);
      }
      if (types.length) query = query.in('business_type', types);
      return query;
    });
    portalRows.forEach((r) => {
      if (!matchesBusinessType(r)) return;
      upsertRecipient(seen, {
        email: r.email,
        name: r.first_name || r.contact_name || r.name || r.business_name || '',
        first_name: r.first_name || '',
        contact_name: r.contact_name || r.name || '',
        business_name: r.business_name || r.name || '',
        customer_code: r.customer_code || '',
        account_code: r.customer_code || '',
        phone: r.phone || '',
        business_type: r.business_type || '',
      });
    });
  }

  if (audience === 'proto-active' || audience === 'all-portal') {
    const protoRows = await fetchAllFromTable(sb, 'proto_active_customers');
    protoRows.forEach((r) => {
      if (!matchesBusinessType(r)) return;
      upsertRecipient(seen, {
        email: r.email,
        name: r.first_name || r.contact_name || r.name || '',
        first_name: r.first_name || '',
        contact_name: r.contact_name || '',
        business_name: r.name || '',
        account_code: r.account_code || '',
        customer_code: r.account_code || '',
        business_type: r.business_type || '',
      });
    });
  }

  return [...seen.values()];
}

export async function sendBroadcastBatch(recipients, { subject, introText = '', htmlBlock = '', onProgress }) {
  let sent = 0;
  let failed = 0;
  const errors = [];
  const messageIds = [];

  for (const recipient of recipients) {
    try {
      const vars = buildRecipientVars(recipient);
      const { subject: personalizedSubject, htmlContent, textContent } = buildComposedEmail(
        { subject, introText, htmlBlock },
        vars,
      );
      const result = await sendBrevoTransactional({
        to: { email: recipient.email, name: vars.name || recipient.email },
        subject: personalizedSubject,
        htmlContent,
        textContent,
      });
      const messageId = result?.messageId || result?.['message-id'] || result?.messageIds?.[0];
      if (messageId) messageIds.push(String(messageId));
      sent += 1;
      if (onProgress) onProgress({ sent, failed, total: recipients.length });
      if (sent % 10 === 0) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      failed += 1;
      if (errors.length < 20) errors.push({ email: recipient.email, error: err.message });
    }
  }

  return { sent, failed, errors, messageIds };
}
