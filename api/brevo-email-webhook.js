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

  // Fail closed: campaign stats are data-integrity sensitive — require the
  // secret to be configured, not merely matched when present.
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret || String(req.query?.secret || '') !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const items = Array.isArray(payload) ? payload : [payload];

  try {
    let updated = 0;
    for (const item of items) {
      const messageId = extractMessageId(item);
      const event = extractEvent(item);
      if (!messageId || !event) continue;
      const result = await recordEmailWebhookEvent({
        messageId,
        event,
        email: extractEmail(item),
        meta: { subject: item.subject },
      });
      if (result && result !== false && !result?.abort) updated += 1;
    }
    return res.status(200).json({ ok: true, updated });
  } catch (err) {
    console.error('brevo-email-webhook:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Webhook processing failed' });
  }
}
