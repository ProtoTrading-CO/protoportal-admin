const SKU_RE = /\b(\d{8,14})\b/;

const PRODUCT_SIGNAL_RE = /(?:show|find|lookup|look\s*up|product|sku|code)\s/i;
const CUSTOMER_SIGNAL_RE = /(?:show|find|lookup|look\s*up|customer|tell me about)\s/i;

/** Material / department terms that often need clarification. */
const AMBIGUOUS_TERMS = new Set([
  'leather', 'wood', 'beads', 'canvas', 'paint', 'spray', 'paper', 'glue',
  'stationery', 'games', 'puzzles', 'fabric', 'ribbon', 'foam',
]);

export function normalizeQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

export function extractSku(query) {
  const m = normalizeQuery(query).match(SKU_RE);
  return m ? m[1] : null;
}

/**
 * Detect product entity when SKU is present with product context.
 * @returns {{ code: string }|null}
 */
export function detectProductEntity(query) {
  const q = normalizeQuery(query);
  const code = extractSku(q);
  if (!code) return null;

  if (PRODUCT_SIGNAL_RE.test(q) || /^product\s+\d/i.test(q) || /^sku\s+\d/i.test(q)) {
    return { code };
  }

  if (/^\d{8,14}[?.!]*$/.test(q)) return { code };

  if (/tell me about\s+\d{8,14}/i.test(q)) return { code };

  return null;
}

/**
 * Detect customer entity from explicit customer phrasing.
 * @returns {{ q: string }|null}
 */
export function detectCustomerEntity(query) {
  const q = normalizeQuery(query);
  if (extractSku(q)) return null;

  const patterns = [
    /^(?:show|find|lookup|look\s*up)\s+customer\s+(.+)$/i,
    /^customer\s+(.+)$/i,
    /^tell me about\s+(.+)$/i,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    const term = m[1].replace(/[?.!]+$/, '').trim();
    if (term.length >= 2 && !/\d{8,14}/.test(term) && looksLikeCustomerName(term)) {
      return { q: term };
    }
  }

  if (/^(?:show|find)\s+[A-Za-z]/i.test(q) && !PRODUCT_SIGNAL_RE.test(q)) {
    const m = q.match(/^(?:show|find)\s+(.+)$/i);
    if (m) {
      const term = m[1].replace(/[?.!]+$/, '').trim();
      if (looksLikeCustomerName(term)) return { q: term };
    }
  }

  return null;
}

function looksLikeCustomerName(term) {
  const t = String(term || '').trim();
  if (!t) return false;
  if (AMBIGUOUS_TERMS.has(t.toLowerCase())) return false;
  if (t.split(/\s+/).length >= 2) return true;
  if (/[A-Z]/.test(t) && t.length >= 4) return true;
  if (t.length < 4) return false;
  return !/^(stock|order|product|website|brief|health)$/i.test(t);
}

/**
 * Single-word or very short queries that could mean product, department, or supplier.
 * @returns {{ term: string, options: Array<{ id: string, label: string }> }|null}
 */
export function detectAmbiguousTerm(query) {
  const q = normalizeQuery(query).replace(/[?.!]+$/, '');
  const words = q.split(/\s+/);
  if (words.length > 3) return null;
  if (extractSku(q)) return null;

  const core = words.join(' ').toLowerCase();
  if (core.length < 3) return null;

  const isAmbiguous =
    words.length === 1 && AMBIGUOUS_TERMS.has(core)
    || (words.length <= 2 && !CUSTOMER_SIGNAL_RE.test(q) && !PRODUCT_SIGNAL_RE.test(q)
      && /^[a-z][a-z\s'-]+$/i.test(q) && !/stock|order|brief|health|yesterday|website/i.test(q));

  if (!isAmbiguous) return null;

  const label = q.charAt(0).toUpperCase() + q.slice(1);
  return {
    term: label,
    options: [
      { id: 'product_lookup', label: `${label} products`, hint: `Tell me about ${label} products` },
      { id: 'department', label: `${label} department`, hint: `Products in the ${label} department` },
      { id: 'supplier', label: `${label} supplier`, hint: `Supplier named ${label}` },
    ],
  };
}

export function formatClarifyReply(clarify) {
  const lines = [
    clarify.message || `**${clarify.term}** could mean a few different things.`,
    '',
    'Which did you mean?',
    '',
  ];
  for (const opt of clarify.options || []) {
    lines.push(`- **${opt.label}** — try: _${opt.hint}_`);
  }
  return lines.join('\n');
}
