import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function sendWatiMessage(phone, text) {
  const base = (process.env.WATI_API_URL || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v1/sendSessionMessage/${phone}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message_text: text }),
  });
  return res.json();
}

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Intercom sends a GET ping to validate the URL on save
  if (req.method === 'GET' || req.method === 'HEAD') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Require WEBHOOK_SECRET — configure ?secret=... on the Intercom webhook URL.
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (String(req.query?.secret || '') !== webhookSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const event = req.body || {};

  // Fire on Fin AI replies (operator) or human agent replies (admin)
  const validTopics = ['conversation.operator.replied', 'conversation.admin.replied'];
  if (!validTopics.includes(event.topic)) {
    return res.status(200).json({ ok: true });
  }

  const conversation = event.data?.item;
  if (!conversation) return res.status(200).json({ ok: true });

  const conversationId = String(conversation.id);
  const parts = conversation.conversation_parts?.conversation_parts || [];
  const latest = parts[0];

  // Skip if from user (would create an echo loop) or no content
  if (!latest || latest.author?.type === 'user') {
    return res.status(200).json({ ok: true });
  }

  const replyText = stripHtml(latest.body);
  if (!replyText) return res.status(200).json({ ok: true });

  const supabase = getAdminClient();
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select()
    .eq('intercom_conversation_id', conversationId)
    .maybeSingle();

  if (!session) return res.status(200).json({ ok: true });

  await sendWatiMessage(session.phone, replyText);

  return res.status(200).json({ ok: true });
}
