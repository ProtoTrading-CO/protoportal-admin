import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson } from './_site-config.js';
import { normalizePhone, watiRequest } from './_wati.js';

const USERS_FILE = 'fulfillment/users.json';
const ORDER_TEMPLATE = process.env.WATI_ORDER_TEMPLATE || 'proto_order_notis';

/** WhatsApp template params cannot contain newlines/tabs or 4+ consecutive spaces. */
function sanitizeParam(value, maxLen = 900) {
  let text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

function parseSendResult(json) {
  const info = String(json?.info || json?.message || json?.error || '').trim();
  const failed = json?.result === false
    || json?.validWhatsAppNumber === false
    || /undeliverable|invalid phone|not a valid|failed|error/i.test(info);
  return failed ? { ok: false, error: info || 'WATI rejected the send' } : { ok: true };
}

/**
 * Sends a test order notification (template + session message) to every
 * fulfillment team member using the exact same WATI calls as a real order.
 * Surfaces per-member errors so delivery problems become visible instead of
 * silently swallowing them at order time.
 */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const data = await readSiteConfigJson(USERS_FILE, { users: [] });
  const recipients = (data.users || [])
    .map((u) => ({ name: String(u.name || '').trim(), phone: normalizePhone(u.whatsapp) }))
    .filter((u) => u.phone);

  if (!recipients.length) {
    return res.status(400).json({ error: 'No team WhatsApp numbers saved. Add team members first.' });
  }

  const now = new Date().toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const adminUrl = (process.env.ADMIN_PORTAL_URL || 'https://protopanel.co.za').replace(/\/$/, '');

  const results = [];
  for (const r of recipients) {
    const detail = { name: r.name, phone: `+${r.phone}`, template: null, session: null };

    try {
      await watiRequest('/api/v1/addContact', {
        method: 'POST',
        body: { name: r.name || 'Fulfilment', phoneNumber: r.phone, allowBroadcast: true },
      });
    } catch { /* contact may already exist */ }

    try {
      const json = await watiRequest(`/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(r.phone)}`, {
        method: 'POST',
        body: {
          template_name: ORDER_TEMPLATE,
          broadcast_name: ORDER_TEMPLATE,
          parameters: [
            { name: '1', value: sanitizeParam(now, 120) },
            { name: '2', value: sanitizeParam('Proto Admin — TEST', 120) },
            { name: '3', value: sanitizeParam('This is a test of the order notification. No action needed.', 900) },
            { name: '4', value: sanitizeParam(adminUrl, 900) },
          ],
        },
      });
      detail.template = parseSendResult(json);
    } catch (err) {
      detail.template = { ok: false, error: err.message };
    }

    try {
      const text = `🧪 *Proto test notification*\nSent ${now} from the admin dashboard. If you can read this, order alerts reach you.`;
      const query = new URLSearchParams({ messageText: text });
      const json = await watiRequest(`/api/v1/sendSessionMessage/${encodeURIComponent(r.phone)}?${query.toString()}`, { method: 'POST' });
      const info = String(json?.info || json?.message || '').trim();
      const failed = json?.result === false || /fail|error|invalid|expired|24.?hour/i.test(info);
      detail.session = failed ? { ok: false, error: info || 'Session message failed' } : { ok: true };
    } catch (err) {
      detail.session = { ok: false, error: err.message };
    }

    detail.ok = Boolean(detail.template?.ok || detail.session?.ok);
    results.push(detail);
  }

  const sent = results.filter((r) => r.ok).length;
  return res.status(200).json({
    ok: sent === results.length,
    template: ORDER_TEMPLATE,
    teamSize: results.length,
    sent,
    failed: results.length - sent,
    results,
  });
}
