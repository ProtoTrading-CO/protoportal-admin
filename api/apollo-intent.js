const INTENTS = [
  {
    id: 'order_top_items',
    weight: 12,
    patterns: [
      /ordered the most/i,
      /top selling/i,
      /best selling/i,
      /most ordered/i,
      /popular products/i,
      /what items are being ordered/i,
      /best performing/i,
      /performing products/i,
      /top products/i,
      /based on orders/i,
      /products.*orders/i,
      /orders.*products/i,
      /barograph/i,
      /bar chart/i,
      /bar graph/i,
    ],
    noTerms: true,
  },
  {
    id: 'product_count',
    weight: 10,
    patterns: [/how many products/i, /product count/i, /total products/i, /catalogue size/i, /number of products/i],
    noTerms: true,
  },
  {
    id: 'product_negative_stock',
    weight: 12,
    patterns: [/negative stock/i, /below zero/i, /less than zero/i, /stock.*negative/i, /negative.*stock/i, /minus stock/i],
    noTerms: true,
  },
  {
    id: 'product_low_stock',
    weight: 10,
    patterns: [/least stock/i, /lowest stock/i, /low stock/i, /running out/i, /minimum stock/i],
    noTerms: true,
  },
  {
    id: 'product_high_stock',
    weight: 8,
    patterns: [/highest stock/i, /most stock/i, /best stocked/i],
    noTerms: true,
  },
  {
    id: 'product_by_category',
    weight: 8,
    patterns: [/products by category/i, /category breakdown/i, /categories do we have/i],
    noTerms: true,
  },
  {
    id: 'customer_list',
    weight: 10,
    patterns: [/who are (my|our) customers/i, /list (all )?customers/i, /all customers/i, /my customers/i, /show customers/i],
    noTerms: true,
  },
  {
    id: 'customer_pending',
    weight: 10,
    patterns: [/pending approval/i, /awaiting approval/i, /customers to approve/i, /unapproved customers/i],
    noTerms: true,
  },
  {
    id: 'order_summary',
    weight: 9,
    patterns: [/order activity/i, /recent orders/i, /how many orders/i, /order summary/i, /orders this month/i],
    noTerms: true,
  },
  {
    id: 'search_top',
    weight: 9,
    patterns: [/top searches/i, /what are (customers|people) searching/i, /popular searches/i],
    noTerms: true,
  },
  {
    id: 'search_zero',
    weight: 9,
    patterns: [/no results/i, /zero results/i, /couldn't find/i, /could not find/i, /failed searches/i],
    noTerms: true,
  },
  {
    id: 'search_to_orders',
    weight: 8,
    patterns: [/search.*order/i, /searches leading to orders/i, /search conversion/i],
    noTerms: true,
  },
  {
    id: 'product_search',
    weight: 5,
    patterns: [/find product/i, /search product/i, /look up sku/i],
    keywords: ['sku'],
  },
  {
    id: 'customer_search',
    weight: 5,
    patterns: [/find customer/i, /customer named/i, /customer called/i],
    keywords: ['customer', 'client'],
  },
];

const NO_TERMS = new Set(INTENTS.filter((i) => i.noTerms).map((i) => i.id));

function scoreIntent(intent, query) {
  let score = 0;
  for (const p of intent.patterns) {
    if (p.test(query)) score += intent.weight;
  }
  if (intent.keywords) {
    const lower = query.toLowerCase();
    for (const kw of intent.keywords) {
      if (lower.includes(kw)) score += 3;
    }
  }
  return score;
}

function extractSearchTerms(query) {
  const cleaned = query
    .replace(/find|search|show|list|look up|tell me about|which|what|items?|products?|have|with|the|a|an|my|our|some|of|do|please/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter((w) => w.length > 2);
  return tokens.slice(0, 4).join(' ') || query.slice(0, 40);
}

export function parseIntent(query) {
  const q = String(query || '').trim();
  if (!q) return { intent: 'unknown', confidence: 0, terms: '', wantsChart: false };

  const wantsChart = /chart|barograph|bar graph|bar chart|graph|visual/i.test(q);

  let best = { id: 'unknown', score: 0 };
  for (const intent of INTENTS) {
    const score = scoreIntent(intent, q);
    if (score > best.score) best = { id: intent.id, score };
  }

  const confidence = Math.min(1, best.score / 12);
  const terms = NO_TERMS.has(best.id) ? '' : extractSearchTerms(q);

  if (best.score >= 5) {
    return { intent: best.id, confidence, terms, wantsChart };
  }

  const lower = q.toLowerCase();
  if (/order|selling|ordered|performing/.test(lower)) {
    return { intent: 'order_top_items', confidence: 0.55, terms: '', wantsChart };
  }
  if (/negative|below zero/.test(lower) && /stock/.test(lower)) {
    return { intent: 'product_negative_stock', confidence: 0.7, terms: '', wantsChart };
  }
  if (/how many products|total products|catalogue size/.test(lower)) {
    return { intent: 'product_count', confidence: 0.6, terms: '', wantsChart };
  }
  if (/customer|client/.test(lower)) {
    return { intent: 'customer_list', confidence: 0.45, terms: extractSearchTerms(q), wantsChart };
  }
  if (/search/.test(lower)) {
    return { intent: 'search_top', confidence: 0.4, terms: '', wantsChart };
  }

  return { intent: 'freeform', confidence: 0, terms: q, wantsChart };
}

export async function classifyWithAi(query, apiKey, { badReply = '', previousIntent = '' } = {}) {
  const fixContext = badReply
    ? `\nThe previous answer was wrong or unhelpful:\n"""${String(badReply).slice(0, 600)}"""\nPrevious intent tried: ${previousIntent || 'unknown'}\nPick the CORRECT intent for the user's question.`
    : '';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'Proto Apollo Intent',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Classify the Proto admin dashboard question. Reply ONLY valid JSON:
{"intent":"<id>","terms":"<search terms or empty>","wantsChart":true|false}
${fixContext}
Intent ids:
- order_top_items — best/most ordered/top selling/performing products by order volume
- product_count — how many products in catalogue
- product_negative_stock — items with stock below zero
- product_low_stock — lowest stock levels
- product_high_stock — highest stock
- product_by_category — category breakdown
- product_search — find specific product by name/sku keyword (terms required)
- customer_list — list all customers
- customer_pending — customers awaiting approval
- customer_search — find a customer by name/email
- order_summary — order counts and recent orders
- search_top — top search terms
- search_zero — searches with no results
- search_to_orders — search conversion
- freeform`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 100,
    }),
  });

  const payload = await response.json();
  if (!response.ok) return null;

  const raw = payload.choices?.[0]?.message?.content || '';
  try {
    const json = JSON.parse(raw.replace(/```json?\s*|\s*```/g, '').trim());
    if (json.intent) {
      return {
        intent: json.intent,
        confidence: 0.85,
        terms: json.terms || '',
        wantsChart: Boolean(json.wantsChart),
      };
    }
  } catch {
    return null;
  }
  return null;
}
