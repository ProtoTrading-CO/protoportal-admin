import { requireAdminKey } from './_admin-auth.js';
import { getApolloData } from './apollo-data.js';
import { parseIntent, classifyWithAi } from './apollo-intent.js';
import { executeIntent } from './apollo-engine.js';

const MODEL = 'google/gemini-2.5-flash';
const CONFIDENCE_THRESHOLD = 0.4;

const NARRATE_PROMPT = `You are Apollo for Proto Trading admin. The user asked a question and the system already fetched LIVE DATA as a structured answer.

Rewrite the structured answer in clear, friendly prose. Keep all numbers and names exact — do not invent data.
Preserve any \`\`\`chart blocks exactly as-is (do not modify JSON inside them).
Use ## headings and bullet points. Be concise.`;

async function narrateWithAi(structuredReply, userQuery, apiKey) {
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
        { role: 'system', content: NARRATE_PROMPT },
        { role: 'user', content: `Question: ${userQuery}\n\nStructured answer:\n${structuredReply}` },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  const payload = await response.json();
  if (!response.ok) return structuredReply;
  return payload.choices?.[0]?.message?.content || structuredReply;
}

async function freeformWithAi(userQuery, data, apiKey) {
  const summary = {
    customers: data.customers.total,
    products: data.products.liveCount,
    orders: data.orders.total,
    topSearches: data.search.topSearches.slice(0, 5),
    lowestStock: data.products.lowestStock.slice(0, 5),
  };

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
        {
          role: 'system',
          content: `${NARRATE_PROMPT}\n\nContext snapshot:\n${JSON.stringify(summary, null, 2)}`,
        },
        { role: 'user', content: userQuery },
      ],
      temperature: 0.35,
      max_tokens: 1500,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Apollo request failed');
  return payload.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const data = await getApolloData(req.query?.refresh === '1');
      return res.status(200).json({
        ok: true,
        indexedAt: data.generatedAt,
        counts: {
          products: data.products.liveCount,
          customers: data.customers.total,
          orders: data.orders.total,
          indexEntries: data.index.length,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Index build failed' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

  const { messages = [], narrate = false } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userQuery = String(lastUser?.content || '').trim();
  if (!userQuery) return res.status(400).json({ error: 'Empty question' });

  try {
    const data = await getApolloData();
    let parsed = parseIntent(userQuery);

    if (parsed.confidence < CONFIDENCE_THRESHOLD) {
      const aiIntent = await classifyWithAi(userQuery, apiKey);
      if (aiIntent) parsed = aiIntent;
    }

    let result = executeIntent(parsed.intent, data, parsed.terms);

    if (!result && parsed.intent !== 'freeform') {
      result = executeIntent('freeform', data, parsed.terms);
    }

    let reply;
    let source;
    let intent;

    if (result) {
      source = result.source;
      intent = result.intent;
      reply = narrate ? await narrateWithAi(result.reply, userQuery, apiKey) : result.reply;
    } else {
      source = 'ai';
      intent = 'freeform';
      reply = await freeformWithAi(userQuery, data, apiKey);
    }

    return res.status(200).json({
      reply,
      source,
      intent,
      indexedAt: data.generatedAt,
      indexSize: data.index.length,
    });
  } catch (err) {
    console.error('apollo:', err?.message || err);
    return res.status(500).json({ error: 'Apollo failed' });
  }
}
