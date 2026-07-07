/** Route natural-language queries to PR2 BI experiences before legacy Apollo path. */

const PRODUCT_CODE_RE = /\b(\d{8,14})\b/;
const SHOW_PRODUCT_RE = /(?:show|find|lookup|look\s*up|product|code)\s*(?:product\s*)?(\d{8,14})/i;
const SHOW_CUSTOMER_RE = /(?:show|find|lookup|look\s*up)\s+customer\s+(.+)/i;
const MORNING_BRIEF_RE = /(?:morning\s+brief|daily\s+brief|what\s+changed\s+yesterday|focus\s+today|what\s+needs\s+attention)/i;

export function detectExperienceRoute(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  if (MORNING_BRIEF_RE.test(q)) {
    return { intent: 'brief.morning', params: {} };
  }

  const productMatch = q.match(SHOW_PRODUCT_RE) || q.match(PRODUCT_CODE_RE);
  if (productMatch && /(?:show|find|lookup|code|product|\d{8,})/i.test(q)) {
    const code = productMatch[1];
    if (code) return { intent: 'product.context', params: { code } };
  }

  const customerMatch = q.match(SHOW_CUSTOMER_RE);
  if (customerMatch) {
    return { intent: 'customer.context', params: { q: customerMatch[1].trim() } };
  }

  if (/negative\s+stock/i.test(q)) {
    return { intent: 'inventory.attention', params: { type: 'negative' }, formatType: 'negative' };
  }
  if (/low\s+stock|lowest\s+stock|running\s+out/i.test(q)) {
    return { intent: 'inventory.attention', params: { type: 'low' }, formatType: 'low' };
  }
  if (/zero\s+stock/i.test(q)) {
    return { intent: 'inventory.attention', params: { type: 'zero' }, formatType: 'zero' };
  }
  if (/high\s+stock|excess\s+stock|too\s+much\s+stock/i.test(q)) {
    return { intent: 'inventory.attention', params: { type: 'high' }, formatType: 'high' };
  }
  if (/inventory\s+attention|stock\s+priorities|stock\s+emergencies/i.test(q)) {
    return { intent: 'inventory.attention', params: { type: 'all' } };
  }

  return null;
}
