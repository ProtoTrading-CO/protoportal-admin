const INTENTS = [
  {
    id: 'product_count',
    weight: 10,
    patterns: [/how many products/i, /product count/i, /total products/i, /catalogue size/i, /number of products/i],
  },
  {
    id: 'product_low_stock',
    weight: 10,
    patterns: [/least stock/i, /lowest stock/i, /low stock/i, /running out/i, /minimum stock/i],
  },
  {
    id: 'product_high_stock',
    weight: 8,
    patterns: [/highest stock/i, /most stock/i, /best stocked/i],
  },
  {
    id: 'product_by_category',
    weight: 8,
    patterns: [/products by category/i, /category breakdown/i, /categories do we have/i],
  },
  {
    id: 'customer_list',
    weight: 10,
    patterns: [/who are (my|our) customers/i, /list (all )?customers/i, /all customers/i, /my customers/i, /show customers/i],
  },
  {
    id: 'customer_pending',
    weight: 10,
    patterns: [/pending approval/i, /awaiting approval/i, /customers to approve/i, /unapproved customers/i],
  },
  {
    id: 'order_top_items',
    weight: 10,
    patterns: [/ordered the most/i, /top selling/i, /best selling/i, /most ordered/i, /popular products/i, /what items are being ordered/i],
  },
  {
    id: 'order_summary',
    weight: 9,
    patterns: [/order activity/i, /recent orders/i, /how many orders/i, /order summary/i, /orders this month/i],
  },
  {
    id: 'search_top',
    weight: 9,
    patterns: [/top searches/i, /what are (customers|people) searching/i, /popular searches/i],
  },
  {
    id: 'search_zero',
    weight: 9,
    patterns: [/no results/i, /zero results/i, /couldn't find/i, /could not find/i, /failed searches/i],
  },
  {
    id: 'search_to_orders',
    weight: 8,
    patterns: [/search.*order/i, /searches leading to orders/i, /search conversion/i],
  },
  {
    id: 'product_search',
    weight: 5,
    patterns: [/find product/i, /search product/i, /look up/i],
    keywords: ['product', 'stock', 'sku', 'item', 'catalogue', 'catalog'],
  },
  {
    id: 'customer_search',
    weight: 5,
    patterns: [/find customer/i, /customer named/i, /customer called/i],
    keywords: ['customer', 'client', 'account'],
  },
];

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

export function parseIntent(query) {
  const q = String(query || '').trim();
  if (!q) return { intent: 'unknown', confidence: 0, terms: '' };

  let best = { id: 'unknown', score: 0 };
  for (const intent of INTENTS) {
    const score = scoreIntent(intent, q);
    if (score > best.score) best = { id: intent.id, score };
  }

  const terms = q
    .replace(/how many|what|who are|show me|list|find|search for|tell me about/gi, '')
    .replace(/products?|customers?|orders?|items?/gi, '')
    .trim();

  const confidence = Math.min(1, best.score / 10);

  if (best.score >= 5) {
    return { intent: best.id, confidence, terms: terms || q };
  }

  const lower = q.toLowerCase();
  if (/product|stock|sku|catalogue|catalog|item/.test(lower)) {
    return { intent: 'product_count', confidence: 0.5, terms: terms || q };
  }
  if (/customer|client|account/.test(lower)) {
    return { intent: 'customer_search', confidence: 0.45, terms: terms || q };
  }
  if (/order/.test(lower)) {
    return { intent: 'order_summary', confidence: 0.4, terms: q };
  }
  if (/search/.test(lower)) {
    return { intent: 'search_top', confidence: 0.4, terms: q };
  }

  return { intent: 'freeform', confidence: 0, terms: q };
}

export async function classifyWithAi(query, apiKey) {
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
          content: `Classify the admin dashboard question. Reply ONLY valid JSON:
{"intent":"<id>","terms":"<search terms>"}
Ids: product_count, product_low_stock, product_high_stock, product_by_category, product_search, customer_list, customer_pending, customer_search, order_top_items, order_summary, search_top, search_zero, search_to_orders, freeform`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 80,
    }),
  });

  const payload = await response.json();
  if (!response.ok) return null;

  const raw = payload.choices?.[0]?.message?.content || '';
  try {
    const json = JSON.parse(raw.replace(/```json?\s*|\s*```/g, '').trim());
    if (json.intent) return { intent: json.intent, confidence: 0.75, terms: json.terms || query };
  } catch {
    return null;
  }
  return null;
}
