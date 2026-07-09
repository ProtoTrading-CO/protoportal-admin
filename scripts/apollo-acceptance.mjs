#!/usr/bin/env node
/**
 * Capability 1.1A — business acceptance (mirrors Apollo Chat POST /api/apollo).
 * Usage: node scripts/apollo-acceptance.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnvLocal() {
  const path = join(root, '.env.local');
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

loadEnvLocal();

const { answerFromExperience, tryProductContextRoute, resolveQuery, getApolloData } = await (async () => {
  const { getApolloData } = await import('../api/apollo-data.js');
  const { tryProductContextRoute } = await import('../api/apollo-product-route.js');
  const { biRun, biFormat } = await import('../api/intelligence/bi/facade.js');
  const { resolveIntent, resolutionToRoute } = await import('../api/apollo-experience.js');
  const { parseIntentHint, classifyIntent } = await import('../api/apollo-intent.js');
  const { validateIntent, validateAnswer } = await import('../api/apollo-validate.js');
  const { executeIntent, parseLimit } = await import('../api/apollo-engine.js');

  async function answerFromExperience(userQuery, actorEmail) {
    const resolved = resolveIntent(userQuery);
    if (resolved && !resolved.ok) {
      return { reply: resolved.reply, source: 'intent', intent: 'clarify', businessIntent: 'clarify' };
    }
    const route = resolved?.ok ? resolutionToRoute(resolved) : null;
    if (!route || route.clarify) {
      if (route?.reply) return { reply: route.reply, source: 'intent', intent: 'clarify', businessIntent: 'clarify' };
      return null;
    }
    const ctx = { actorEmail: actorEmail || 'apollo' };
    const envelope = await biRun(route.intent, route.params, ctx);
    if (!envelope.ok) {
      if (route.intent === 'product.context') {
        return {
          reply: `## Product ${route.params?.code || ''}\n\nCould not load product context: ${envelope.error?.message || 'unknown error'}.`,
          source: 'product.context',
          intent: 'product.context',
          businessIntent: 'product_lookup',
        };
      }
      throw new Error(envelope.error?.message || 'Experience query failed');
    }
    const source = route.intent === 'product.context' ? 'product.context' : 'experience';
    return {
      reply: biFormat(route.intent, envelope, { type: route.formatType || route.params?.type, formatSection: route.formatSection }),
      source,
      intent: route.intent,
      businessIntent: route.businessIntent || route.intent,
      resolution: { method: route.method, confidence: route.confidence },
    };
  }

  function answerFromData(data, parsed, userQuery) {
    const limit = parseLimit(userQuery);
    const result = executeIntent(parsed.intent, data, parsed.terms, { limit, skus: parsed.skus || [], userQuery });
    return result || null;
  }

  async function resolveQuery(userQuery, data, apiKey) {
    const productRoute = await tryProductContextRoute(userQuery, 'apollo');
    if (productRoute) {
      return { reply: productRoute.reply, source: productRoute.source, intent: productRoute.intent, businessIntent: productRoute.businessIntent };
    }
    const hint = parseIntentHint(userQuery);
    let parsed = await classifyIntent(userQuery, apiKey, { regexHint: hint });
    if (!parsed) {
      parsed = { intent: hint.confidence >= 0.85 ? hint.intent : 'freeform', terms: '', wantsChart: false };
    }
    if (!validateIntent(userQuery, parsed)) {
      const retry = await classifyIntent(userQuery, apiKey, { rejectIntent: parsed.intent, regexHint: hint });
      if (retry && validateIntent(userQuery, retry)) parsed = retry;
    }
    let result = parsed.intent === 'freeform' ? null : answerFromData(data, parsed, userQuery);
    if (result && validateAnswer(userQuery, parsed, result)) {
      return { reply: result.reply, source: 'live-index', intent: result.intent, businessIntent: parsed.intent };
    }
    return { reply: 'No answer', source: 'none', intent: 'freeform' };
  }

  return { answerFromExperience, tryProductContextRoute, resolveQuery, getApolloData };
})();

async function callApollo(query, prior = []) {
  const actorEmail = 'george@proto.co.za';
  const userQuery = String(query || '').trim();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY required for keyword/AI routes');

  const productRoute = await tryProductContextRoute(userQuery, actorEmail);
  if (productRoute) return productRoute;

  const experience = await answerFromExperience(userQuery, actorEmail);
  if (experience) return experience;

  const data = await getApolloData();
  return resolveQuery(userQuery, data, apiKey);
}

const tests = [
  {
    id: 1,
    name: 'Bare SKU 8626100145',
    query: '8626100145',
    expect(reply, json) {
      if (/no products matched/i.test(reply)) return 'Still using keyword index';
      if (json.source !== 'product.context' && json.source !== 'experience') return `Wrong source: ${json.source}`;
      if (!/8626100145/.test(reply)) return 'Missing SKU in reply';
      if (!/PLAYING CARDS|playing cards/i.test(reply)) return 'Expected product title in reply';
      if (!/erp_sql|BLADERUNNER|Evidence/i.test(reply)) return 'Missing trust/evidence signals';
      return null;
    },
  },
  {
    id: 2,
    name: 'Tell me about SKU 8626100145',
    query: 'Tell me about SKU 8626100145',
    expect(reply, json) {
      if (/no products matched/i.test(reply)) return 'Still using keyword index';
      if (!/8626100145/.test(reply)) return 'Missing SKU';
      if (!/PLAYING CARDS|playing cards/i.test(reply)) return 'Expected same product title';
      return null;
    },
  },
  {
    id: 3,
    name: 'Title keyword: playing cards animal',
    query: 'playing cards animal',
    expect(reply, json) {
      if (/no products matched/i.test(reply)) return 'Keyword search missed known product';
      if (json.source !== 'product.context') return `Expected product.context, got ${json.source}`;
      if (!/8626100145|PLAYING CARDS ANIMAL/i.test(reply)) return 'Did not find Playing Cards Animal (8626100145)';
      return null;
    },
  },
  {
    id: 4,
    name: 'Tell me about Playing Cards Animal',
    query: 'Tell me about Playing Cards Animal',
    expect(reply, json) {
      if (/no customer found/i.test(reply)) return 'Misrouted to customer lookup';
      if (json.businessIntent === 'customer_lookup') return 'Misrouted to customer_lookup';
      if (!/8626100145|PLAYING CARDS ANIMAL/i.test(reply)) return 'Did not find Playing Cards Animal (8626100145)';
      return null;
    },
  },
  {
    id: 5,
    name: 'Different SKU 8626100146',
    query: '8626100146',
    expect(reply, json, ctx) {
      if (/no products matched/i.test(reply)) return 'Keyword index miss';
      if (reply.includes('8626100145')) return 'Returned cached/wrong SKU';
      if (!/8626100146/.test(reply)) return 'Missing requested SKU';
      if (ctx.prior8626100145 && reply === ctx.prior8626100145) return 'Same reply as 8626100145 — possible cache';
      return null;
    },
  },
  {
    id: 6,
    name: 'Unknown SKU 9999999999',
    query: '9999999999',
    expect(reply) {
      if (/no products matched/i.test(reply)) return 'Keyword index message — should be ERP voice';
      if (!/9999999999/.test(reply)) return 'Missing SKU in reply';
      if (!/couldn'?t find|not found|no erp/i.test(reply)) return 'Expected ERP-not-found voice';
      return null;
    },
  },
  {
    id: 7,
    name: 'Judgement boundary after product context',
    query: 'Why should I reorder this?',
    prior: [{ role: 'user', content: '8626100145' }, { role: 'assistant', content: '## Product 8626100145\n\n### PLAYING CARDS ANIMAL' }],
    expect(reply, json) {
      if (/no products matched/i.test(reply)) return 'Fell through to keyword search';
      if (json.source === 'product.context' && /870002|Backpack/i.test(reply)) {
        return 'Misrouted judgement question to product title search';
      }
      if (/judgement|1\.4|not yet graduated|cannot advise|don't have|won't guess/i.test(reply)) return null;
      if (/reorder because|you should reorder/i.test(reply)) return 'Answered judgement without graduating 1.4';
      if (json.source === 'none' || json.intent === 'freeform') return null;
      return 'Expected humble boundary about Product Judgement (1.4), or freeform — not product context';
    },
  },
];

console.log('=== Capability 1.1A — Apollo Chat acceptance ===\n');
console.log('.env.local:', existsSync(join(root, '.env.local')) ? 'yes' : 'no');
console.log('ADMIN_DASH_KEY:', Boolean(process.env.ADMIN_DASH_KEY));
console.log('OPENROUTER_API_KEY:', Boolean(process.env.OPENROUTER_API_KEY));
console.log('SQL configured:', Boolean(process.env.SQL_PASSWORD || process.env.STOCK_SQL_BRIDGE_URL));
console.log('');

const ctx = {};
let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    const json = await callApollo(t.query, t.prior || []);
    const reply = String(json.reply || '');
    const err = t.expect(reply, json, ctx);
    if (t.id === 1) ctx.test1Reply = reply;
    if (t.id === 1) ctx.test1Json = json;
    if (t.id === 5 && ctx.test1Reply) ctx.prior8626100145 = ctx.test1Reply;

    if (err) {
      failed += 1;
      console.log(`FAIL — Test ${t.id}: ${t.name}`);
      console.log(`  Reason: ${err}`);
      console.log(`  source=${json.source} intent=${json.intent} businessIntent=${json.businessIntent || '—'}`);
      console.log(`  Preview: ${reply.slice(0, 180).replace(/\n/g, ' ')}…`);
    } else {
      passed += 1;
      console.log(`PASS — Test ${t.id}: ${t.name}`);
      console.log(`  source=${json.source} intent=${json.intent}`);
    }
  } catch (e) {
    failed += 1;
    console.log(`FAIL — Test ${t.id}: ${t.name}`);
    console.log(`  Error: ${e.message}`);
  }
  console.log('');
}

console.log(`--- ${passed}/${tests.length} passed ---`);
process.exit(failed ? 1 : 0);
