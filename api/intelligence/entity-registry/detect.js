const SKU_RE = /\b(\d{8,14})\b/;

const PRODUCT_SIGNAL_RE = /(?:show|find|lookup|look\s*up|product|sku|code)\s/i;
const CUSTOMER_SIGNAL_RE = /(?:show|find|lookup|look\s*up|customer|tell me about)\s/i;
const SUPPLIER_SIGNAL_RE = /(?:show|find|lookup|look\s*up|supplier|tell me about supplier)\s/i;
const CONTAINER_SIGNAL_RE = /\bcontainer\b/i;

/** Material / department terms that need clarification — not direct entity routing. */
const AMBIGUOUS_TERMS = new Set([
  'leather', 'wood', 'beads', 'canvas', 'paint', 'spray', 'paper', 'glue',
  'stationery', 'games', 'puzzles', 'fabric', 'ribbon', 'foam',
]);

/** Known supplier names resolvable without explicit prefix (Capability 1 seed). */
const SUPPLIER_HINTS = new Set(['motarro']);

export function normalizeQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

export function extractSku(query) {
  const m = normalizeQuery(query).match(SKU_RE);
  return m ? m[1] : null;
}

/**
 * @returns {{ entityType: 'product', entityId: string, params: { code: string } }|null}
 */
export function detectProductEntity(query) {
  const q = normalizeQuery(query);
  const code = extractSku(q);
  if (!code) return null;

  if (PRODUCT_SIGNAL_RE.test(q) || /^product\s+\d/i.test(q) || /^sku\s+\d/i.test(q)) {
    return { entityType: 'product', entityId: code, params: { code } };
  }

  if (/^\d{8,14}[?.!]*$/.test(q)) {
    return { entityType: 'product', entityId: code, params: { code } };
  }

  if (/tell me about\s+(?:sku\s+)?\d{8,14}/i.test(q)) {
    return { entityType: 'product', entityId: code, params: { code } };
  }

  const tellSku = q.match(/^tell me about\s+sku\s+(\d{8,14})\s*$/i);
  if (tellSku) {
    return { entityType: 'product', entityId: tellSku[1], params: { code: tellSku[1] } };
  }

  return null;
}

/**
 * @returns {{ entityType: 'container', entityId: string, params: { reference: string, number: string } }|null}
 */
export function detectContainerEntity(query) {
  const q = normalizeQuery(query);
  if (extractSku(q)) return null;

  const patterns = [
    /^(?:show|find|lookup|look\s*up)\s+container\s*#?\s*(\d+)\s*$/i,
    /^container\s*#?\s*(\d+)\s*$/i,
    /^cont\s*#?\s*(\d+)\s*$/i,
    /^tell me about\s+container\s*#?\s*(\d+)\s*$/i,
  ];

  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    const number = m[1];
    const reference = `Container ${number}`;
    return {
      entityType: 'container',
      entityId: reference,
      params: { reference, number },
    };
  }

  return null;
}

/**
 * @returns {{ entityType: 'supplier', entityId: string, params: { name: string } }|null}
 */
export function detectSupplierEntity(query) {
  const q = normalizeQuery(query);
  if (extractSku(q) || detectContainerEntity(q)) return null;
  if (/\bcustomer\b/i.test(q)) return null;

  const explicit = [
    /^(?:show|find|lookup|look\s*up)\s+supplier\s+(.+)$/i,
    /^supplier\s+(.+)$/i,
    /^tell me about\s+supplier\s+(.+)$/i,
  ];

  for (const re of explicit) {
    const m = q.match(re);
    if (!m) continue;
    const name = m[1].replace(/[?.!]+$/, '').trim();
    if (name.length >= 2) {
      return { entityType: 'supplier', entityId: name, params: { name } };
    }
  }

  const tellAbout = q.match(/^tell me about\s+(.+)$/i);
  if (tellAbout) {
    const name = tellAbout[1].replace(/[?.!]+$/, '').trim();
    if (name.length >= 2 && looksLikeSupplierBare(name)) {
      return { entityType: 'supplier', entityId: name, params: { name } };
    }
  }

  const bare = q.replace(/[?.!]+$/, '').trim();
  if (!bare || /\s/.test(bare)) return null;
  if (AMBIGUOUS_TERMS.has(bare.toLowerCase())) return null;
  if (CUSTOMER_SIGNAL_RE.test(q) || PRODUCT_SIGNAL_RE.test(q)) return null;

  const core = bare.toLowerCase();
  if (SUPPLIER_HINTS.has(core)) {
    return { entityType: 'supplier', entityId: bare, params: { name: bare } };
  }

  // Longer single proper nouns default to supplier intelligence (e.g. Motarro).
  if (looksLikeSupplierBare(bare)) {
    return { entityType: 'supplier', entityId: bare, params: { name: bare } };
  }

  return null;
}

/**
 * @returns {{ entityType: 'customer', entityId: string, params: { q: string } }|null}
 */
export function detectCustomerEntity(query) {
  const q = normalizeQuery(query);
  if (extractSku(q) || detectContainerEntity(q)) return null;

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
      return { entityType: 'customer', entityId: term, params: { q: term } };
    }
  }

  if (/^(?:show|find)\s+[A-Za-z]/i.test(q) && !PRODUCT_SIGNAL_RE.test(q) && !SUPPLIER_SIGNAL_RE.test(q)) {
    const m = q.match(/^(?:show|find)\s+(.+)$/i);
    if (m) {
      const term = m[1].replace(/[?.!]+$/, '').trim();
      if (looksLikeCustomerName(term) && !looksLikeSupplierBare(term)) {
        return { entityType: 'customer', entityId: term, params: { q: term } };
      }
    }
  }

  // Bare customer name (e.g. "Addie").
  const bare = q.replace(/[?.!]+$/, '').trim();
  if (
    bare
    && !/\s/.test(bare)
    && looksLikeCustomerName(bare)
    && !looksLikeSupplierBare(bare)
    && !AMBIGUOUS_TERMS.has(bare.toLowerCase())
  ) {
    return { entityType: 'customer', entityId: bare, params: { q: bare } };
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
  return !/^(stock|order|product|website|brief|health|supplier|container)$/i.test(t);
}

function looksLikeSupplierBare(term) {
  const t = String(term || '').trim();
  if (!t || /\s/.test(t)) return false;
  if (SUPPLIER_HINTS.has(t.toLowerCase())) return true;
  // Single proper noun, 6+ chars — supplier intelligence default (Motarro).
  return /^[A-Z][A-Za-z&'.-]{5,}$/.test(t);
}

/**
 * @returns {{ term: string, options: Array<{ id: string, label: string, hint: string, entityType?: string }> }|null}
 */
export function detectAmbiguousTerm(query) {
  const q = normalizeQuery(query).replace(/[?.!]+$/, '');
  const words = q.split(/\s+/);
  if (words.length > 3) return null;
  if (extractSku(q)) return null;
  if (detectContainerEntity(q)) return null;

  const core = words.join(' ').toLowerCase();
  if (core.length < 3) return null;

  const isAmbiguous =
    (words.length === 1 && AMBIGUOUS_TERMS.has(core))
    || (words.length <= 2
      && !CUSTOMER_SIGNAL_RE.test(q)
      && !PRODUCT_SIGNAL_RE.test(q)
      && !SUPPLIER_SIGNAL_RE.test(q)
      && !CONTAINER_SIGNAL_RE.test(q)
      && /^[a-z][a-z\s'-]+$/i.test(q)
      && !/stock|order|brief|health|yesterday|website/i.test(q));

  if (!isAmbiguous) return null;

  const label = q.charAt(0).toUpperCase() + q.slice(1);
  return {
    term: label,
    options: [
      { id: 'product_lookup', label: `${label} products`, hint: `Tell me about ${label} products`, entityType: 'product' },
      { id: 'department', label: `${label} department`, hint: `Products in the ${label} department` },
      { id: 'supplier_lookup', label: `${label} supplier`, hint: `Supplier named ${label}`, entityType: 'supplier' },
      { id: 'customer_lookup', label: `${label} customer`, hint: `Find customer ${label}`, entityType: 'customer' },
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
