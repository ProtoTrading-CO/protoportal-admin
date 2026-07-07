import { requireAdminKey } from './_admin-auth.js';
import { getApolloData } from './apollo-data.js';
import { parseIntentHint, classifyIntent } from './apollo-intent.js';
import { validateIntent, validateAnswer } from './apollo-validate.js';
import { executeIntent, parseLimit } from './apollo-engine.js';
import { detectExperienceRoute, resolveIntent, resolutionToRoute } from './apollo-experience.js';
import { biRun, biFormat, buildDailyBriefContext, formatDailyBriefContext } from './intelligence/bi/facade.js';

const MODEL = 'google/gemini-2.5-flash';

function isGreeting(query) {
  const q = String(query || '').trim();
  return /^(hi|hello|hey|howdy)(\s+there)?[\s!.,?]*$|^good\s+(morning|afternoon|evening)[\s!.,?]*$/i.test(q);
}

function greetingReply() {
  return `Hello — I'm **Apollo**, your Proto Trading admin assistant.

Your **Daily Brief** loads when you open this tab. Ask me things like:
- *Show product 8610100001*
- *Find customer Plushprops*
- *Which products have negative stock?*
- *Morning brief*

I'll answer from live portal and stock data — not guesses.`;
}

async function answerFromExperience(userQuery, actorEmail) {
  const resolved = resolveIntent(userQuery);

  if (resolved && !resolved.ok) {
    return {
      reply: resolved.reply,
      source: 'intent',
      intent: 'clarify',
      businessIntent: 'clarify',
    };
  }

  const route = resolved?.ok ? resolutionToRoute(resolved) : detectExperienceRoute(userQuery);
  if (!route || route.clarify) {
    if (route?.reply) {
      return {
        reply: route.reply,
        source: 'intent',
        intent: 'clarify',
        businessIntent: 'clarify',
      };
    }
    return null;
  }

  const ctx = { actorEmail: actorEmail || 'apollo' };
  const envelope = await biRun(route.intent, route.params, ctx);
  if (!envelope.ok) {
    throw new Error(envelope.error?.message || 'Experience query failed');
  }

  return {
    reply: biFormat(route.intent, envelope, {
      type: route.formatType || route.params?.type,
      formatSection: route.formatSection,
    }),
    source: 'live-index',
    intent: route.intent,
    businessIntent: route.businessIntent || route.intent,
    resolution: {
      method: route.method,
      confidence: route.confidence,
    },
    experience: envelope.data,
  };
}

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
    imageStyle: parsed.imageStyle || '',
    userQuery,
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
      imageStyle: '',
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
      'HTTP-Referer': 'https://admin.proto.co.za',
      'X-Title': 'Proto Apollo',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Apollo for Proto Trading admin. Answer ONLY from the live data below. Never invent numbers.
Use ## headings and bullets. Do NOT include chart blocks unless the user explicitly asks for data, stats, stock levels, orders, or searches.
When charts are requested, use:
\`\`\`chart
{"type":"bar","title":"...","labels":["A"],"values":[1]}
\`\`\`
Max 10 chart labels. ZAR currency. Be direct and conversational.`,
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
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const actorEmail = req.headers['x-admin-email'] || 'apollo';
      const briefEnvelope = await buildDailyBriefContext({ actorEmail, bypassCache: req.query?.refresh === '1' });
      const data = await getApolloData(req.query?.refresh === '1');
      return res.status(200).json({
        ok: true,
        indexedAt: data.generatedAt,
        brief: briefEnvelope.ok ? {
          context: briefEnvelope.data,
          meta: briefEnvelope.meta,
          markdown: formatDailyBriefContext(briefEnvelope),
        } : null,
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

  if (isGreeting(userQuery)) {
    return res.status(200).json({
      reply: greetingReply(),
      source: 'greeting',
      intent: 'greeting',
      indexedAt: new Date().toISOString(),
    });
  }

  try {
    const actorEmail = req.headers['x-admin-email'] || 'apollo';
    const experience = await answerFromExperience(userQuery, actorEmail);
    if (experience) {
      const data = await getApolloData();
      return res.status(200).json({
        reply: experience.reply,
        source: experience.source,
        intent: experience.intent,
        businessIntent: experience.businessIntent || experience.intent,
        resolution: experience.resolution || null,
        indexedAt: data.generatedAt,
        indexSize: data.index.length,
      });
    }

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
    const msg = formatServerError(err);
    return res.status(500).json({ error: msg });
  }
}

function formatServerError(err) {
  if (!err) return 'Apollo failed';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err?.message === 'string') return err.message;
  return 'Apollo failed';
}
