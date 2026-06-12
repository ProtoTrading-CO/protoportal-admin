import { requireAdminKey } from './_admin-auth.js';
import { buildApolloContext } from './apollo-context.js';

const MODEL = 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `You are Apollo, the AI assistant for Proto Trading's wholesale admin dashboard (protoportal-admin).

You help the sales team understand and act on:
- Order requests and fulfilment workflow
- Customer management (approvals, tiers, accounts)
- Product catalogue (website_stock, categories, archive, pricing)
- Search analytics (what customers search for, zero-result terms, conversion)

Rules:
- Be concise, practical, and South-Africa aware (ZAR currency, en-ZA dates).
- Use the LIVE DATA snapshot in the user message — do not invent numbers.
- When a visual helps, include a chart block using EXACTLY this format (one per chart):

\`\`\`chart
{"type":"bar","title":"Chart title","labels":["A","B"],"values":[1,2]}
\`\`\`

Chart types: "bar" only for now. Max 10 labels. Values must be numbers.
- For summaries suitable for PDF export, structure with clear headings (##) and bullet points.
- You cannot modify data — only analyse and recommend actions.
- If asked about something outside the snapshot, say what data is missing and suggest where in the admin to look.`;

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

  const { messages = [] } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const context = await buildApolloContext();
    const contextBlock = `\n\nLIVE ADMIN DATA (auto-refreshed ${context.generatedAt}):\n${JSON.stringify(context, null, 2)}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://protoportal-admin.vercel.app',
        'X-Title': 'Proto Apollo',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + contextBlock },
          ...messages.slice(-20).map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content || ''),
          })),
        ],
        temperature: 0.4,
        max_tokens: 2048,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error('apollo openrouter:', payload?.error || response.status);
      return res.status(502).json({ error: payload?.error?.message || 'Apollo request failed' });
    }

    const reply = payload.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      reply,
      model: MODEL,
      contextGeneratedAt: context.generatedAt,
    });
  } catch (err) {
    console.error('apollo:', err?.message || err);
    return res.status(500).json({ error: 'Apollo failed' });
  }
}
