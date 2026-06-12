import { requireAdminKey } from './_admin-auth.js';
import { getApolloData } from './apollo-data.js';
import { parseIntentHint, classifyIntent } from './apollo-intent.js';
import { validateIntent, validateAnswer } from './apollo-validate.js';
import { executeIntent, parseLimit } from './apollo-engine.js';

const MODEL = 'google/gemini-2.5-flash';

function appendChart(reply, title, labels, values) {
  if (!labels.length) return reply;
  return `${reply}\n\`\`\`chart\n${JSON.stringify({ type: 'bar', title, labels, values })}\n\`\`\``;
}

function ensureChart(intent, reply, data) {
  const { orders, products, search } = data;

  if (intent === 'product_negative_stock') {
    const rows = products.negativeStock?.slice(0, 10) || [];
    if (!rows.length) return reply;
    return appendChart(reply, 'Negative stock levels', rows.map((p) => p.sku.slice(0, 12)), rows.map((p) => p.stockOnHand));
  }
  if (intent === 'order_top_items') {
    const top = orders.topLineItems.slice(0, 10);
    if (!top.length) return reply;
    return appendChart(reply, 'Top ordered items', top.map((t) => t.code.slice(0, 12)), top.map((t) => t.totalQty));
  }
  if (intent === 'product_low_stock') {
    const rows = products.lowestStock.slice(0, 10);
    if (!rows.length) return reply;
    return appendChart(reply, 'Lowest stock', rows.map((p) => p.sku.slice(0, 12)), rows.map((p) => p.stockOnHand));
  }
  if (intent === 'search_top') {
    const top = search.topSearches.slice(0, 10);
    if (!top.length) return reply;
    return appendChart(reply, 'Top searches', top.map((r) => r.normalized_search_term.slice(0, 14)), top.map((r) => Number(r.searches)));
  }
  return reply;
}

function answerFromData(data, parsed, userQuery) {
  const limit = parseLimit(userQuery);
  const result = executeIntent(parsed.intent, data, parsed.terms, {
    limit,
    skus: parsed.skus || [],
    imagePrompt: parsed.imagePrompt || '',
  });
  if (!result) return null;

  if (parsed.wantsChart && result.reply && !result.reply.includes('```chart')) {
    result.reply = ensureChart(parsed.intent, result.reply, data);
  }

  return result;
}

async function resolveQuery(userQuery, data, apiKey, { rejectIntent = '', badReply = '' } = {}) {
  const hint = parseIntentHint(userQuery);

  let parsed = await classifyIntent(userQuery, apiKey, { rejectIntent, badReply, regexHint: hint });
  if (!parsed) {
    parsed = {
      intent: !rejectIntent && hint.confidence >= 0.85 ? hint.intent : 'freeform',
      terms: '',
      skus: [],
      imagePrompt: '',
      wantsChart: hint.wantsChart,
    };
  }

  if (!validateIntent(userQuery, parsed)) {
    const retry = await classifyIntent(userQuery, apiKey, { rejectIntent: parsed.intent, badReply, regexHint: hint });
    if (retry && validateIntent(userQuery, retry)) parsed = retry;
  }

  let result = parsed.intent === 'freeform' ? null : answerFromData(data, parsed, userQuery);

  if (!validateAnswer(userQuery, parsed, result)) {
    const retry = await classifyIntent(userQuery, apiKey, { rejectIntent: parsed.intent, badReply, regexHint: hint });
    if (retry && validateIntent(userQuery, retry)) {
      parsed = retry;
      result = parsed.intent === 'freeform' ? null : answerFromData(data, parsed, userQuery);
    }
  }

  if (result && validateAnswer(userQuery, parsed, result)) {
    return {
      reply: result.reply,
      source: 'live-index',
      intent: result.intent,
      batchAction: result.batchAction || null,
    };
  }

  return fallbackAnswer(userQuery, data, apiKey);
}

async function fallbackAnswer(userQuery, data, apiKey) {
  const ctx = {
    productCount: data.products.liveCount,
    archived: data.products.archivedCount,
    customers: data.customers.list,
    topOrdered: data.orders.topLineItems.slice(0, 15),
    lowestStock: data.products.lowestStock.slice(0, 10),
    negativeStock: data.products.negativeStock?.slice(0, 10) || [],
    topSearches: data.search.topSearches.slice(0, 10),
    zeroSearches: data.search.zeroResultTerms.slice(0, 10),
    recentOrders: data.orders.recent.slice(0, 8),
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
          content: `You are Apollo for Proto Trading admin. Answer ONLY from the live data below. Never invent numbers.
Use ## headings, bullets, and include a chart block when helpful:
\`\`\`chart
{"type":"bar","title":"...","labels":["A"],"values":[1]}
\`\`\`
Max 10 chart labels. ZAR currency. Be direct.`,
        },
        {
          role: 'user',
          content: `Question: ${userQuery}\n\nLive data:\n${JSON.stringify(ctx, null, 2)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Apollo request failed');

  return {
    reply: payload.choices?.[0]?.message?.content || 'I could not find an answer in the live data.',
    source: 'ai',
    intent: 'freeform',
  };
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

  const { messages = [], fix = false, badReply = '', previousIntent = '' } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userQuery = String(lastUser?.content || '').trim();
  if (!userQuery) return res.status(400).json({ error: 'Empty question' });

  try {
    const data = await getApolloData();
    const rejectIntent = fix ? (previousIntent || '') : '';
    const { reply, source, intent, batchAction } = await resolveQuery(userQuery, data, apiKey, {
      rejectIntent,
      badReply: fix ? badReply : '',
    });

    return res.status(200).json({
      reply,
      source: fix ? 'fixed' : source,
      intent,
      batchAction,
      indexedAt: data.generatedAt,
      indexSize: data.index.length,
    });
  } catch (err) {
    console.error('apollo:', err?.message || err);
    return res.status(500).json({ error: 'Apollo failed' });
  }
}
