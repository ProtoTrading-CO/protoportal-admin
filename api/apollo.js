import { requireAdminKey } from './_admin-auth.js';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getApolloData } from './apollo-data.js';
import { parseIntentHint, classifyIntent, isPortalOverviewQuery } from './apollo-intent.js';
import { validateIntent, validateAnswer } from './apollo-validate.js';
import { executeIntent, parseLimit } from './apollo-engine.js';
import { detectExperienceRoute, resolveIntent, resolutionToRoute } from './apollo-experience.js';
import { biRun, biFormat, buildDailyBriefContext, formatDailyBriefContext } from './intelligence/bi/facade.js';
import { tryProductContextRoute } from './apollo-product-route.js';
import { getPortalAdminClient } from './_site-config.js';
import { handleApolloAction } from './intelligence/apollo-action-engine/index.js';
import { loadWorkspaceDocumentIndex } from './_workspace-document-store.js';
import { trySqlReportRoute } from './apollo-sql-reports.js';

const MODEL = 'google/gemini-2.5-flash';

export function createRoutingTrace(question, {
  traceId = randomUUID(),
  now = () => performance.now(),
  startedAt = new Date().toISOString(),
} = {}) {
  const startedAtMs = now();
  const decisions = [];

  return {
    traceId,
    startDecision() {
      return now();
    },
    addDecision({ context, outcome, reason, confidence, startedAt: decisionStartedAt = null }) {
      const numericConfidence = Number(confidence);
      decisions.push({
        context,
        outcome,
        reason,
        confidence: Number.isFinite(numericConfidence)
          ? Math.max(0, Math.min(1, numericConfidence))
          : null,
        durationMs: decisionStartedAt == null
          ? 0
          : Math.max(0, Math.round(now() - decisionStartedAt)),
      });
    },
    finish(final) {
      const payload = {
        question: String(question || '').slice(0, 240),
        traceId,
        startedAt,
        decisions,
        final,
        totalDurationMs: Math.max(0, Math.round(now() - startedAtMs)),
      };
      console.info('[apollo-routing]', JSON.stringify(payload));
      return payload;
    },
  };
}

function contextName(intent) {
  if (intent === 'product.context' || intent === 'product_lookup') return 'Product Context';
  if (intent === 'customer.context' || intent === 'customer_lookup') return 'Customer Context';
  if (intent === 'supplier.context' || intent === 'supplier_lookup') return 'Supplier Context';
  if (intent === 'container.context' || intent === 'container_lookup') return 'Container Context';
  if (intent === 'portal_overview') return 'Overview Context';
  if (intent === 'clarify') return 'Clarification';
  return 'Business Context';
}

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

function isWorkspaceDocumentQuery(query) {
  return /\b(document|documents|file|files|attachment|attachments|pdf|invoice|invoices|quote|quotes|contract|contracts|spreadsheet|spreadsheets|upload|uploaded)\b/i.test(String(query || ''));
}

function documentSearchTerms(query) {
  const ignored = new Set([
    'show', 'find', 'what', 'which', 'where', 'when', 'have', 'with', 'from', 'that',
    'document', 'documents', 'file', 'files', 'attachment', 'attachments', 'uploaded', 'upload',
    'apollo', 'please', 'about', 'into', 'workspace', 'workspaces',
  ]);
  return [...new Set(String(query || '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]{2,}/g) || [])]
    .filter((term) => !ignored.has(term));
}

async function answerFromWorkspaceDocuments(query) {
  if (!isWorkspaceDocumentQuery(query)) return null;
  const supabase = getPortalAdminClient();
  const data = (await loadWorkspaceDocumentIndex(supabase))
    .filter((document) => document.upload_status === 'available' && !document.deleted_at)
    .slice(0, 500);

  const terms = documentSearchTerms(query);
  const requestedWorkspace = ['orders', 'customers', 'suppliers', 'containers', 'buying']
    .find((workspace) => new RegExp(`\\b${workspace}\\b`, 'i').test(query));
  const ranked = (data || [])
    .map((document) => {
      if (requestedWorkspace && document.workspace_type !== requestedWorkspace) return null;
      const searchable = [
        document.title, document.filename, document.category, document.notes, document.summary,
        document.suggested_workspace, ...(document.tags || []), document.extracted_text,
        ...Object.values(document.detected_entities || {}).flat(),
      ].filter(Boolean).join(' ').toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { document, score, searchable };
    })
    .filter(Boolean)
    .filter((row) => !terms.length || row.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.document.uploaded_at || b.document.created_at) - new Date(a.document.uploaded_at || a.document.created_at))
    .slice(0, 12);

  if (!ranked.length) {
    return {
      reply: `## Workspace documents\n\nI could not find a current document matching **${query.replace(/[*_`]/g, '')}** in the private Apollo vault. Try the filename, supplier/customer name, document type or workspace.`,
      source: 'workspace-documents',
      intent: 'workspace_document_search',
    };
  }

  const lines = ranked.map(({ document }) => {
    const name = document.title || document.filename;
    const version = document.version > 1 ? ` · v${document.version}` : '';
    const record = document.record_id ? ' · linked record' : '';
    const searchable = document.extraction_status === 'ready' ? ' · text searchable' : '';
    const summary = String(document.summary || '').trim();
    return `- **${name}** — ${document.workspace_type} / ${document.category}${version}${record}${searchable}${summary ? `\n  ${summary.slice(0, 180)}` : ''}`;
  });
  return {
    reply: `## Workspace documents\n\n${lines.join('\n')}\n\nSource: private Apollo document vault. Open the relevant Work workspace to preview or download a file.`,
    source: 'workspace-documents',
    intent: 'workspace_document_search',
  };
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
    if (route.intent === 'product.context') {
      const code = route.params?.code || '';
      return {
        reply: `## Product ${code}\n\nCould not load product context: ${envelope.error?.message || 'unknown error'}.`,
        source: 'product.context',
        intent: 'product.context',
        businessIntent: 'product_lookup',
      };
    }
    throw new Error(envelope.error?.message || 'Experience query failed');
  }

  const source = route.intent === 'product.context' ? 'product.context' : 'experience';

  return {
    reply: biFormat(route.intent, envelope, {
      type: route.formatType || route.params?.type,
      formatSection: route.formatSection,
    }),
    source,
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
          content: `You are Apollo for Proto Trading admin — not the public website. Answer ONLY from the live data below. Never invent numbers.
Label each section's source: website catalogue, trade portal customers, portal orders, or website search analytics. Never open with "This website is for Proto Trading."
For Positill ERP sales or live BLADERUNNER stock, say you need a specific question (e.g. best seller today, SKU lookup) — this snapshot is portal data only.
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

  const { messages = [], fix = false, badReply = '', previousIntent = '', proposedAction = null, confirmAction = false, conversationContext = null } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userQuery = String(lastUser?.content || '').trim();
  if (!userQuery) return res.status(400).json({ error: 'Empty question' });

  try {
    const actorEmail = req.headers['x-admin-email'] || 'apollo';
    const actionResponse = await handleApolloAction({
      query: userQuery,
      proposedAction,
      confirmAction,
      supabase: getPortalAdminClient(),
      actor: actorEmail,
      conversationContext: conversationContext || {
        messages: messages.slice(-8).map(({ role, content, intent }) => ({
          role,
          content,
          intent: intent || null,
        })),
        proposedAction,
        lastIntent: previousIntent || null,
      },
    });
    if (actionResponse) {
      return res.status(200).json(actionResponse);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Apollo action failed' });
  }

  if (isGreeting(userQuery)) {
    return res.status(200).json({
      reply: greetingReply(),
      source: 'greeting',
      intent: 'greeting',
      indexedAt: new Date().toISOString(),
    });
  }

  try {
    const documentAnswer = await answerFromWorkspaceDocuments(userQuery);
    if (documentAnswer) {
      return res.status(200).json({ ...documentAnswer, indexedAt: new Date().toISOString() });
    }
  } catch (error) {
    console.error('apollo workspace documents:', error?.message || error);
  }

  try {
    const sqlReportAnswer = await trySqlReportRoute(userQuery);
    if (sqlReportAnswer) {
      return res.status(200).json({ ...sqlReportAnswer, indexedAt: new Date().toISOString() });
    }
  } catch (error) {
    console.error('apollo sql reports:', error?.message || error);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });

  try {
    const actorEmail = req.headers['x-admin-email'] || 'apollo';
    const routingTrace = createRoutingTrace(userQuery);

    // System-level prompts are deterministic. Route them before any entity
    // resolver so a loose title match can never produce a random product.
    if (isPortalOverviewQuery(userQuery)) {
      routingTrace.addDecision({
        context: 'Product Context',
        outcome: 'declined',
        reason: 'no product entity',
        confidence: 0,
      });
      const overviewStartedAt = routingTrace.startDecision();
      const data = await getApolloData();
      const result = answerFromData(data, {
        intent: 'portal_overview',
        terms: '',
        skus: [],
        wantsChart: false,
      }, userQuery);
      routingTrace.addDecision({
        context: 'Overview Context',
        outcome: 'accepted',
        reason: 'portal_overview intent',
        confidence: 1,
        startedAt: overviewStartedAt,
      });
      routingTrace.finish('portal_overview');
      return res.status(200).json({
        reply: result.reply,
        source: 'live-index',
        intent: 'portal_overview',
        batchAction: null,
        indexedAt: data.generatedAt,
        indexSize: data.index.length,
      });
    }

    const productStartedAt = routingTrace.startDecision();
    const productRoute = await tryProductContextRoute(userQuery, actorEmail);
    if (productRoute) {
      routingTrace.addDecision({
        context: 'Product Context',
        outcome: 'accepted',
        reason: productRoute.resolution?.method || 'recognized product entity',
        confidence: productRoute.resolution?.confidence ?? 1,
        startedAt: productStartedAt,
      });
      const data = await getApolloData();
      routingTrace.finish(productRoute.businessIntent || productRoute.intent);
      return res.status(200).json({
        reply: productRoute.reply,
        source: productRoute.source,
        intent: productRoute.intent,
        businessIntent: productRoute.businessIntent || productRoute.intent,
        resolution: productRoute.resolution || null,
        indexedAt: data.generatedAt,
        indexSize: data.index.length,
      });
    }
    routingTrace.addDecision({
      context: 'Product Context',
      outcome: 'declined',
      reason: 'no high-confidence product entity',
      confidence: 0,
      startedAt: productStartedAt,
    });

    const experienceStartedAt = routingTrace.startDecision();
    const experience = await answerFromExperience(userQuery, actorEmail);
    if (experience) {
      routingTrace.addDecision({
        context: contextName(experience.businessIntent || experience.intent),
        outcome: 'accepted',
        reason: experience.resolution?.method || 'recognized business intent/entity',
        confidence: experience.resolution?.confidence ?? 1,
        startedAt: experienceStartedAt,
      });
      const data = await getApolloData();
      routingTrace.finish(experience.businessIntent || experience.intent);
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
    routingTrace.addDecision({
      context: 'Entity/Context Resolver',
      outcome: 'declined',
      reason: 'no recognized entity or deterministic context',
      confidence: 0,
      startedAt: experienceStartedAt,
    });

    const data = await getApolloData();
    const rejectIntent = fix ? (previousIntent || '') : '';
    const assistantStartedAt = routingTrace.startDecision();
    const { reply, source, intent, batchAction } = await resolveQuery(userQuery, data, apiKey, {
      rejectIntent,
      badReply: fix ? badReply : '',
    });

    routingTrace.addDecision({
      context: contextName(intent),
      outcome: 'accepted',
      reason: source === 'ai' ? 'general assistant fallback' : 'classified intent',
      confidence: source === 'ai' ? 0.5 : 0.85,
      startedAt: assistantStartedAt,
    });
    routingTrace.finish(intent);
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
