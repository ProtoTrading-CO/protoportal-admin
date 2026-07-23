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
