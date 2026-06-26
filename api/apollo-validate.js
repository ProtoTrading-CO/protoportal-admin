/** Reject intent/answer pairs that clearly mismatch the user's question. */

const BLOCKED = {
  product_count: [
    /performing/i, /ordered/i, /selling/i, /best/i, /top/i, /popular/i,
    /chart/i, /barograph/i, /negative/i, /customer/i, /search/i,
  ],
  product_search: [
    /how many/i, /negative/i, /customer/i, /performing/i, /ordered/i,
    /catalogue size/i, /pending approval/i,
  ],
  order_summary: [/product count/i, /^how many products/i, /negative stock/i],
  customer_list: [/product/i, /stock/i, /search/i, /order.*item/i],
};

const STOP_TERMS = new Set([
  'which', 'have', 'with', 'negative', 'stock', 'levels', 'items', 'find',
  'show', 'list', 'what', 'some', 'being', 'the', 'are', 'that', 'this',
]);

export function validateIntent(query, parsed) {
  const q = String(query || '').toLowerCase();
  const { intent, terms } = parsed;

  const blocked = BLOCKED[intent];
  if (blocked?.some((re) => re.test(q))) return false;

  if (intent === 'product_search') {
    const t = String(terms || '').toLowerCase().trim();
    if (!t || t.length < 2) return false;
    const words = t.split(/\s+/);
    if (words.every((w) => STOP_TERMS.has(w))) return false;
    if (/negative|stock level|which have/.test(t)) return false;
  }

  if (intent === 'customer_search' && !String(terms || '').trim()) return false;

  if (intent === 'batch_fix_images') {
    const hasTerms = String(terms || '').trim().length > 0;
    const hasSkus = Array.isArray(parsed.skus) && parsed.skus.length > 0;
    if (!hasTerms && !hasSkus) return false;
  }

  if (intent === 'product_search' && /find code|lookup code|sku\s+\d/i.test(q)) {
    const code = q.match(/\d{6,}/)?.[0];
    if (code && !String(terms || '').includes(code)) return false;
  }

  return true;
}

export function validateAnswer(query, parsed, result) {
  if (!result?.reply) return false;
  if (!validateIntent(query, parsed)) return false;

  const q = String(query || '').toLowerCase();
  const { intent } = parsed;

  if (intent === 'order_top_items' && /product catalogue/i.test(result.reply) && !/ordered/i.test(result.reply)) {
    return false;
  }

  if (intent === 'product_negative_stock' && /no products matched/i.test(result.reply)) {
    return false;
  }

  if (intent === 'product_count' && /most ordered|performing/i.test(q)) {
    return false;
  }

  return true;
}
