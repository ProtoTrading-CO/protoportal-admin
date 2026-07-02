import { getTaxonomySubcategoryLabels } from './_subcategory-match.js';

/** Regex hints only — never used as final routing without AI confirmation. */

const INTENTS = [
  { id: 'batch_fix_images', weight: 14, patterns: [/fix (the )?images/i, /fix all.*images/i, /image fixer/i, /image gen/i, /new products engine/i, /through gemini/i, /gemini new products/i, /put them through/i, /reprocess.*images/i, /white background/i, /remove (the )?background/i, /resize.*800/i, /800\s*[x×]\s*800/i, /products with (the )?(following )?codes/i, /\bshadow/i, /generative/i, /canvas/i, /monttaro/i, /mottaro/i, /motarro/i, /painting on/i, /subcategory/i] },
  { id: 'order_top_items', weight: 12, patterns: [/best performing/i, /performing products/i, /ordered the most/i, /top selling/i, /most ordered/i, /based on orders/i, /popular products/i, /barograph/i, /bar chart/i] },
  { id: 'product_count', weight: 10, patterns: [/^how many products/i, /product count/i, /total products/i, /catalogue size/i, /number of products/i] },
  { id: 'product_negative_stock', weight: 12, patterns: [/negative stock/i, /below zero/i, /stock.*negative/i, /negative.*stock/i] },
  { id: 'product_low_stock', weight: 10, patterns: [/least stock/i, /lowest stock/i, /low stock/i, /running out/i] },
  { id: 'product_high_stock', weight: 8, patterns: [/highest stock/i, /most stock/i] },
  { id: 'product_by_category', weight: 8, patterns: [/by category/i, /category breakdown/i] },
  { id: 'customer_list', weight: 10, patterns: [/who are (my|our) customers/i, /list customers/i, /all customers/i, /my customers/i] },
  { id: 'customer_pending', weight: 10, patterns: [/pending approval/i, /awaiting approval/i] },
  { id: 'order_summary', weight: 9, patterns: [/order activity/i, /recent orders/i, /how many orders/i] },
  { id: 'search_top', weight: 9, patterns: [/top searches/i, /what are.*searching/i] },
  { id: 'search_zero', weight: 9, patterns: [/no results/i, /zero results/i, /couldn't find/i] },
  { id: 'search_to_orders', weight: 8, patterns: [/search.*order/i, /search conversion/i] },
  { id: 'product_search', weight: 4, patterns: [/find product/i, /look up sku/i] },
  { id: 'customer_search', weight: 4, patterns: [/find customer/i, /customer named/i] },
];

const VALID_INTENTS = new Set([
  'order_top_items', 'product_count', 'product_negative_stock', 'product_low_stock',
  'product_high_stock', 'product_by_category', 'product_search', 'customer_list',
  'customer_pending', 'customer_search', 'order_summary', 'search_top',
  'search_zero', 'search_to_orders', 'batch_fix_images', 'freeform',
]);

export function parseIntentHint(query) {
  const q = String(query || '').trim();
  const wantsChart = /chart|barograph|bar graph|bar chart|graph|visual/i.test(q);

  let best = { id: 'freeform', score: 0 };
  for (const intent of INTENTS) {
    let score = 0;
    for (const p of intent.patterns) {
      if (p.test(q)) score += intent.weight;
    }
    if (score > best.score) best = { id: intent.id, score };
  }

  return {
    intent: best.id,
    confidence: Math.min(1, best.score / 12),
    wantsChart,
  };
}

export async function classifyIntent(query, apiKey, { rejectIntent = '', regexHint = null, badReply = '' } = {}) {
  const hint = regexHint || parseIntentHint(query);
  const rejectNote = rejectIntent
    ? `\nREJECTED intent "${rejectIntent}" — it produced a wrong answer.${badReply ? ` Wrong reply excerpt: "${String(badReply).slice(0, 160).replace(/\n/g, ' ')}"` : ''} Pick a different intent.`
    : '';

  const subcategoryHints = getTaxonomySubcategoryLabels().slice(0, 80).join(', ');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://admin.proto.co.za',
      'X-Title': 'Proto Apollo Intent',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `You route Proto Trading admin questions to exactly ONE data query. Reply ONLY JSON:
{"intent":"<id>","terms":"<subcategory or product keyword filter>","skus":["SKU1","SKU2"],"imagePrompt":"<creative/editing instructions>","imageStyle":"standard|shadow|generative","wantsChart":true|false}
${rejectNote}

Regex hint (may be wrong): ${hint.intent} (${Math.round(hint.confidence * 100)}%)

DISAMBIGUATION — follow strictly:
• Image editing / image gen / batch fix by SUBCATEGORY NAME → batch_fix_images
  - User says "fix all images on/in [subcategory]" → terms = subcategory name ONLY (e.g. "canvases and surfaces", "games and puzzles")
  - User lists multiple subcategories → terms = comma-separated names (e.g. "canvases, spray paint") — NOT merged into one name
  - Match against taxonomy labels below — use the closest exact subcategory phrase(s) in terms
  - product line / keyword in title → terms = keyword phrase (e.g. "monttaro canvas")
  - specific product codes/SKUs listed → skus = ["CODE1","CODE2"], terms = ""
  - imagePrompt = ALL creative/editing instructions (white bg, shadows, kids painting on canvas, etc.) — copy verbatim from user
  - imageStyle = "generative" if painting on canvas, kids painting, artwork, or creative scene; "shadow" if only shadow; else "standard"
  - If user wants BOTH shadow AND painting on canvas → imageStyle = "generative" and imagePrompt must mention both

Known subcategory labels (match terms to these): ${subcategoryHints}

• "fix images / gemini new products / put through new products" for a subcategory → batch_fix_images
• "best performing / top selling / most ordered / products + orders" → order_top_items (NOT product_count)
• "how many products / catalogue size / total products" ONLY → product_count
• "negative stock / below zero / give me N products with negative stock" → product_negative_stock (NOT product_search)
• "lowest / least stock" → product_low_stock
• "who are customers / list customers" → customer_list
• "pending approval" → customer_pending
• product_search ONLY when user names a specific SKU or product keyword for lookup (NOT image editing) (terms = that keyword)
• terms = subcategory when batch_fix_images by category; empty when batch_fix_images by skus array
• skus = array of product codes when user lists codes for image work; empty array otherwise
• imagePrompt = copy user's image editing/creative instructions; empty if only "fix images"
• imageStyle = standard | shadow | generative (see above)

Examples:
"fix all images on canvases, spray paint subcategory white background with shadow" → {"intent":"batch_fix_images","terms":"canvases, spray paint","skus":[],"imagePrompt":"white background with soft studio shadow, product clearly in view","imageStyle":"shadow","wantsChart":false}
"fix all the images on canvases and surfaces subcategory — white background, product clearly in view, with shadows and a kids painting on the canvas" → {"intent":"batch_fix_images","terms":"canvases and surfaces","skus":[],"imagePrompt":"white background with product clearly in view, soft studio shadows, and a colourful kids painting displayed on the canvas","imageStyle":"generative","wantsChart":false}
"fix all images on games and puzzles subcategory white background with shadow" → {"intent":"batch_fix_images","terms":"games and puzzles","skus":[],"imagePrompt":"white background with soft studio drop shadow, product clearly in view","imageStyle":"shadow","wantsChart":false}
"do image gen on all monttaro canvas products white background product clearly in view painting on the canvas" → {"intent":"batch_fix_images","terms":"monttaro canvas","skus":[],"imagePrompt":"Place on white background with product clearly in view and a beautiful painting displayed on the canvas","imageStyle":"generative","wantsChart":false}
"all mottaro canvas with shadow on white background" → {"intent":"batch_fix_images","terms":"mottaro canvas","skus":[],"imagePrompt":"white background with soft studio drop shadow","imageStyle":"shadow","wantsChart":false}
"products with codes ABC123 and XYZ789 resize them to 800 by 800 remove background white background" → {"intent":"batch_fix_images","terms":"","skus":["ABC123","XYZ789"],"imagePrompt":"resize to 800 by 800 remove the background and make it a white background","wantsChart":false}
"fix images for games and puzzles subcategory" → {"intent":"batch_fix_images","terms":"games and puzzles","skus":[],"imagePrompt":"","wantsChart":false}
"all products in subcategory games and puzzles put through gemini new products" → {"intent":"batch_fix_images","terms":"games and puzzles","skus":[],"imagePrompt":"","wantsChart":false}
"best performing products bar chart" → {"intent":"order_top_items","terms":"","wantsChart":true}
"give me 5 products with negative stock" → {"intent":"product_negative_stock","terms":"","wantsChart":false}
"how many products do we have" → {"intent":"product_count","terms":"","wantsChart":false}
"find items with negative stock" → {"intent":"product_negative_stock","terms":"","wantsChart":false}
"who are my customers" → {"intent":"customer_list","terms":"","wantsChart":false}
"search for drill" → {"intent":"product_search","terms":"drill","wantsChart":false}

Valid intents: order_top_items, product_count, product_negative_stock, product_low_stock, product_high_stock, product_by_category, product_search, customer_list, customer_pending, customer_search, order_summary, search_top, search_zero, search_to_orders, batch_fix_images, freeform`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 200,
    }),
  });

  const payload = await response.json();
  if (!response.ok) return null;

  try {
    const json = JSON.parse((payload.choices?.[0]?.message?.content || '').replace(/```json?\s*|\s*```/g, '').trim());
    if (!json.intent || !VALID_INTENTS.has(json.intent)) return null;
    return {
      intent: json.intent,
      terms: String(json.terms || '').trim().slice(0, 80),
      skus: Array.isArray(json.skus) ? json.skus.map((s) => String(s).trim()).filter(Boolean).slice(0, 50) : [],
      imagePrompt: String(json.imagePrompt || '').trim().slice(0, 2000),
      imageStyle: ['standard', 'shadow', 'generative'].includes(json.imageStyle) ? json.imageStyle : '',
      wantsChart: Boolean(json.wantsChart) || hint.wantsChart,
    };
  } catch {
    return null;
  }
}
