import { recordEmailWebhookEvent } from './_email-campaigns.js';

function extractMessageId(payload = {}) {
  return String(
    payload['message-id']
    || payload.messageId
    || payload.message_id
    || payload['message-id-guid']
    || payload.uuid
    || payload.id
    || '',
  ).trim();
}

function extractEvent(payload = {}) {
  return String(payload.event || payload.type || payload.reason || '').trim();
}

function extractEmail(payload = {}) {
  return String(payload.email || payload.recipient || payload.to || '').trim().toLowerCase();
}

/** Brevo transactional webhook — configure URL with ?secret=WEBHOOK_SECRET when set. */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  // When WEBHOOK_SECRET is configured, require it (query ?secret= OR the
  // X-Webhook-Secret header) — this is the locked-down mode. When it is NOT
  // configured, accept events so analytics work out of the box (open/click
  // counters only; nothing destructive), and log a one-line nudge to set it.
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const provided = String(req.query?.secret || req.headers['x-webhook-secret'] || '');
    if (provided !== webhookSecret) return res.status(401).json({ error: 'Unauthorized' });
  } else {
    console.warn('brevo-email-webhook: WEBHOOK_SECRET not set — accepting events unauthenticated. Set WEBHOOK_SECRET in Vercel and append ?secret=… to the Brevo webhook URL to lock this down.');
  }

  const payload = req.body || {};
  const items = Array.isArray(payload) ? payload : [payload];

  try {
    let updated = 0;
    let unmatched = 0;
    for (const item of items) {
      const messageId = extractMessageId(item);
      const event = extractEvent(item);
      if (!messageId || !event) continue;
      const result = await recordEmailWebhookEvent({
        messageId,
        event,
        email: extractEmail(item),
        link: String(item.link || item.url || '').trim() || null,
        meta: { subject: item.subject },
      });
      if (result && result !== false && !result?.abort) updated += 1;
      else unmatched += 1;
    }
    // Surface silent drops: an event whose message-id matches no known campaign
    // means the send path didn't capture that id (e.g. a transactional email).
    if (unmatched) {
      console.warn(`brevo-email-webhook: ${unmatched} event(s) did not match any campaign message-id (${items.length} received).`);
    }
    return res.status(200).json({ ok: true, updated, unmatched });
  } catch (err) {
    console.error('brevo-email-webhook:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed' });
  }
}
