import { requireAdminKey } from './_admin-auth.js';
import { PROTO_URLS } from './_proto-urls.js';
import { fetchApprovedWatiTemplates, fetchAllWatiContacts } from './_wati.js';

/** Quick WATI / webhook diagnostics for the WhatsApp admin tab. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const webhookUrl = `${PROTO_URLS.admin}/api/wati-intercom`;
  const legacyWebhookUrl = 'https://protoportal-admin.vercel.app/api/wati-intercom';
  const hasToken = Boolean(process.env.WATI_API_TOKEN);
  const hasIntercom = Boolean(process.env.INTERCOM_TOKEN);

  let templates = [];
  let templateError = '';
  let contactCount = 0;
  let contactError = '';

  if (hasToken) {
    try {
      templates = await fetchApprovedWatiTemplates();
    } catch (err) {
      templateError = err.message || 'Failed to load templates';
    }
    try {
      const contacts = await fetchAllWatiContacts({ fresh: true });
      contactCount = contacts.length;
    } catch (err) {
      contactError = err.message || 'Failed to load contacts';
    }
  }

  let webhookProbe = null;
  try {
    const probe = await fetch(webhookUrl, { method: 'GET' });
    webhookProbe = { status: probe.status, ok: probe.ok };
  } catch (err) {
    webhookProbe = { ok: false, error: err.message };
  }

  return res.status(200).json({
    ok: hasToken && !templateError,
    webhookUrl,
    legacyWebhookUrl,
    webhookProbe,
    watiApiConfigured: hasToken,
    intercomConfigured: hasIntercom,
    approvedTemplateCount: templates.length,
    templateError,
    contactCount,
    contactError,
    watiApiUrl: (process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950').replace(/\/$/, ''),
    orderTemplate: process.env.WATI_ORDER_TEMPLATE || 'proto_order_notis',
  });
}
