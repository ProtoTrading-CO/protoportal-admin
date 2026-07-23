import { runSqlReport, SQL_REPORT_SOURCE } from './_sql-reports.js';

const SKU_CAPTURE = /\b([A-Z0-9][A-Z0-9._-]{3,63})\b/i;
const SKU_ONLY_RE = /^[A-Z0-9][A-Z0-9._-]{3,63}[?.!]*$/i;

function cleanSku(value) {
  return String(value || '').trim().toUpperCase().replace(/[?.!]+$/, '');
}

function extractSku(query) {
  const candidates = [...String(query || '').matchAll(new RegExp(SKU_CAPTURE, 'gi'))]
    .map((match) => cleanSku(match[1]));
  // Natural language commands contain words such as "show" and "product".
  // Prefer the code-shaped candidate with a digit; this keeps an exact numeric
  // or alpha-numeric SKU from being mistaken for part of the sentence.
  return candidates.find((candidate) => /\d/.test(candidate)) || candidates.at(-1) || null;
}

/**
 * Exact product lookups are deliberately deterministic.  They must never
 * depend on the language model, a keyword index, or stale website cache.
 */
export function isDeterministicProductLookup(query) {
  const q = String(query || '').trim();
  if (!q || /\b(monthly sales|invoice[- ]?lines?|report|top selling|stock health)\b/i.test(q)) {
    return false;
  }

  return SKU_ONLY_RE.test(q)
    || /^(?:show|find|lookup|look\s*up|check)\s+(?:product|sku|item)\s+[A-Z0-9][A-Z0-9._-]{3,63}[?.!]*$/i.test(q)
    || /^(?:product|sku|item)\s+[A-Z0-9][A-Z0-9._-]{3,63}[?.!]*$/i.test(q);
}

/** A buying decision remains deterministic until supplier/on-order inputs are connected. */
export function isReorderDecisionQuery(query) {
  const q = String(query || '').trim();
  return /\b(?:should\s+i\s+)?(?:reorder|buy|order)\b/i.test(q)
    && /\b[A-Z0-9][A-Z0-9._-]{3,63}\b/i.test(q);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '—';
}

function money(value) {
  return `R ${number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function lastTwelveMonths() {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return { date_from: isoDate(start), date_to: isoDate(end) };
}

function monthLabel(row) {
  const year = row.SALES_YEAR ?? row.salesYear;
  const month = row.SALES_MONTH ?? row.salesMonth;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function recommendation(available, recentUnits, salesMonths) {
  if (available <= 0) return 'Out of stock — review replenishment before the next sale.';
  if (!recentUnits) return 'No recent sales — review demand before committing to another order.';

  const monthlyVelocity = recentUnits / Math.min(3, Math.max(1, salesMonths));
  const cover = available / monthlyVelocity;
  if (cover < 1) return 'Low cover — investigate a reorder now.';
  if (cover < 3) return 'Watch closely — stock cover is below three months.';
  if (cover >= 12) return 'High cover — avoid adding stock until demand supports it.';
  return 'Stock position looks workable — continue monitoring demand.';
}

export function formatProductIntelligence({ lookup, monthly, generatedAt = new Date().toISOString() }) {
  const product = lookup.rows?.[0] || null;
  const requestedSku = lookup.parameters?.sku || '—';

  if (!product) {
    return `## Product lookup\n\n**${requestedSku}** was not found in POSWINSQL. I did not use AI or a catalogue guess.\n\n_Source: ${SQL_REPORT_SOURCE} · read-only exact SKU lookup._`;
  }

  const onHand = number(product.ONHAND ?? product.onhand);
  const booked = number(product.BOOKED ?? product.booked);
  const available = number(product.AVAILABLE ?? product.available ?? (onHand - booked));
  const rows = [...(monthly.rows || [])].sort((a, b) => monthLabel(a).localeCompare(monthLabel(b)));
  const annualUnits = rows.reduce((total, row) => total + number(row.UNITS ?? row.units), 0);
  const annualValue = rows.reduce((total, row) => total + number(row.SALES_VALUE ?? row.salesValue), 0);
  const recentRows = rows.slice(-3);
  const recentUnits = recentRows.reduce((total, row) => total + number(row.UNITS ?? row.units), 0);
  const velocity = recentUnits / Math.min(3, Math.max(1, recentRows.length));
  const monthsCover = velocity > 0 ? available / velocity : null;
  const recentEvidence = recentRows.length
    ? recentRows.map((row) => `- **${monthLabel(row)}:** ${number(row.UNITS ?? row.units)} units · ${money(row.SALES_VALUE ?? row.salesValue)}`).join('\n')
    : '- No sales recorded in the selected 12-month window.';

  return [
    '## Product intelligence',
    '',
    '_Exact Positill/POS lookup completed before any AI response._',
    '',
    `### ${text(product, 'DESCR', 'description')}`,
    `- **SKU:** ${text(product, 'CODE', 'code', 'SKU', 'sku')}`,
    `- **Department:** ${text(product, 'DEPT', 'dept')}`,
    `- **Price A:** ${money(product.PRICE_A ?? product.priceA ?? product.price)}`,
    '',
    '### Stock position',
    `- **On hand:** ${onHand} units`,
    `- **Booked:** ${booked} units`,
    `- **Available:** **${available} units**`,
    '',
    '### Demand and cover',
    `- **Last 12 months:** ${annualUnits} units · ${money(annualValue)}`,
    `- **Recent 3-month velocity:** ${velocity.toFixed(1)} units/month`,
    `- **Estimated cover:** ${monthsCover == null ? 'not available — no recent sales' : `${monthsCover.toFixed(1)} months`}`,
    '',
    '### Recent sales evidence',
    recentEvidence,
    '',
    '### Apollo recommendation',
    recommendation(available, recentUnits, recentRows.length),
    '',
    `_Source: ${SQL_REPORT_SOURCE} · read-only · generated ${generatedAt}_`,
  ].join('\n');
}

function dateLabel(value) {
  if (!value) return 'no recorded sale in the last 12 months';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-ZA');
}

function reorderDecision({ available, sales3m, sales6m, sales12m }) {
  const monthlyVelocity = sales3m / 3;
  const monthsCover = monthlyVelocity > 0 ? available / monthlyVelocity : null;
  if (available <= 0) {
    return {
      label: 'REORDER NOW',
      detail: 'There is no available stock and the item has recent demand.',
      monthsCover,
    };
  }
  if (sales3m <= 0) {
    return {
      label: 'HOLD — REVIEW DEMAND',
      detail: 'There were no sales in the last three months, so a reorder would not be evidence-led.',
      monthsCover: null,
    };
  }
  if (monthsCover < 1) {
    return {
      label: 'REORDER NOW',
      detail: 'Current available stock is below one month of recent demand.',
      monthsCover,
    };
  }
  if (monthsCover < 3) {
    return {
      label: 'PLAN REORDER',
      detail: 'Cover is below three months. Confirm supplier lead time and incoming stock before placing the order.',
      monthsCover,
    };
  }
  return {
    label: 'HOLD — NO REORDER YET',
    detail: 'Current available stock covers at least three months at the recent sales rate.',
    monthsCover,
  };
}

export function formatReorderDecision({ lookup, evidence, generatedAt = new Date().toISOString() }) {
  const product = lookup.rows?.[0] || null;
  const requestedSku = lookup.parameters?.sku || evidence.parameters?.skus?.[0] || '—';
  if (!product) {
    return `## Reorder decision\n\n**${requestedSku}** was not found in POSWINSQL. I did not use an AI or catalogue guess.\n\n_Source: ${SQL_REPORT_SOURCE} · read-only exact SKU lookup._`;
  }

  const row = evidence.rows?.[0] || product;
  const available = number(row.AVAILABLE ?? row.available ?? product.AVAILABLE ?? product.available);
  const sales3m = number(row.SALES_3M ?? row.sales3m);
  const sales6m = number(row.SALES_6M ?? row.sales6m);
  const sales12m = number(row.SALES_12M ?? row.sales12m);
  const decision = reorderDecision({ available, sales3m, sales6m, sales12m });

  return [
    '## Reorder decision',
    '',
    '_Exact Positill/POS lookup completed before the buying decision. No AI estimate was used._',
    '',
    `### ${text(product, 'DESCR', 'description')}`,
    `- **SKU:** ${text(product, 'CODE', 'code', 'SKU', 'sku')}`,
    `- **Department:** ${text(product, 'DEPT', 'dept')}`,
    `- **Available now:** **${available} units**`,
    '',
    '### Demand evidence',
    `- **Last 3 months:** ${sales3m} units`,
    `- **Last 6 months:** ${sales6m} units`,
    `- **Last 12 months:** ${sales12m} units`,
    `- **Last sale:** ${dateLabel(row.LAST_SALE_DATE ?? row.lastSaleDate)}`,
    `- **Recent velocity:** ${(sales3m / 3).toFixed(1)} units/month`,
    `- **Estimated cover:** ${decision.monthsCover == null ? 'not available' : `${decision.monthsCover.toFixed(1)} months`}`,
    '',
    '### Apollo recommendation',
    `**${decision.label}** — ${decision.detail}`,
    '',
    '### Before placing an order',
    '- Supplier lead time, MOQ/pack size, and incoming container stock are not connected to this decision yet.',
    '- No reorder quantity is suggested until those inputs are live.',
    '',
    `_Source: ${SQL_REPORT_SOURCE} · read-only · generated ${generatedAt}_`,
  ].join('\n');
}

export async function tryDeterministicProductLookup(query) {
  if (!isDeterministicProductLookup(query)) return null;
  const sku = extractSku(query);
  if (!sku) return null;

  try {
    // Lookup always completes first. Sales enrichment can never substitute for
    // the exact POS product truth.
    const lookup = await runSqlReport('inventory.product_lookup', { sku });
    const monthly = lookup.rows?.length
      ? await runSqlReport('sales.product_monthly', { sku, ...lastTwelveMonths() })
      : { rows: [] };

    return {
      reply: formatProductIntelligence({ lookup, monthly }),
      source: 'positill-product-lookup',
      intent: 'product_intelligence',
      businessIntent: 'product_lookup',
      productIntelligence: {
        sku,
        lookup,
        monthly,
      },
    };
  } catch (err) {
    return {
      reply: `## Product lookup failed\n\nI could not complete the exact POS lookup for **${sku}**: ${err.message || 'unknown error'}. I did not fall back to AI.`,
      source: 'positill-product-lookup',
      intent: 'product_intelligence',
      businessIntent: 'product_lookup',
    };
  }
}

export async function tryReorderDecision(query) {
  if (!isReorderDecisionQuery(query)) return null;
  const sku = extractSku(query);
  if (!sku) return null;

  try {
    // Product master is intentionally first so a decision is never made for a
    // guessed or fuzzy catalogue match.
    const lookup = await runSqlReport('inventory.product_lookup', { sku });
    const evidence = lookup.rows?.length
      ? await runSqlReport('buying.sku_evidence', { skus: [sku] })
      : { rows: [], parameters: { skus: [sku] } };

    return {
      reply: formatReorderDecision({ lookup, evidence }),
      source: 'positill-reorder-decision',
      intent: 'reorder_decision',
      businessIntent: 'buying_reorder_decision',
      productIntelligence: { sku, lookup, evidence },
    };
  } catch (err) {
    return {
      reply: `## Reorder decision failed\n\nI could not complete the POS evidence check for **${sku}**: ${err.message || 'unknown error'}. I did not fall back to AI.`,
      source: 'positill-reorder-decision',
      intent: 'reorder_decision',
      businessIntent: 'buying_reorder_decision',
    };
  }
}
