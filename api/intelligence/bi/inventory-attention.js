import { executeQuery } from '../../query-engine/execute.js';
import { ok } from '../../query-engine/envelope.js';
import { mergeMeta, provenanceFootnote } from './shared/format.js';

export async function buildInventoryAttention(params = {}, ctx = {}) {
  const type = String(params.type || 'all').toLowerCase();
  const limit = Math.min(25, Math.max(5, Number(params.limit) || 15));

  const tasks = [];
  if (type === 'all' || type === 'negative') {
    tasks.push(['negative', executeQuery('stock.negative_stock_list', { limit }, ctx)]);
  }
  if (type === 'all' || type === 'low') {
    tasks.push(['low', executeQuery('stock.low_stock_list', { limit, threshold: 10 }, ctx)]);
  }
  if (type === 'all' || type === 'zero') {
    tasks.push(['zero', executeQuery('stock.zero_stock_list', { limit }, ctx)]);
  }
  if (type === 'all' || type === 'high') {
    tasks.push(['high', executeQuery('stock.high_stock_list', { limit: Math.min(limit, 20) }, ctx)]);
  }

  const results = await Promise.all(tasks.map(([, p]) => p));
  const failed = results.find((r) => !r.ok);
  if (failed) return failed;

  const data = { negative: [], low: [], zero: [], high: [] };
  const envelopes = [];
  tasks.forEach(([key], i) => {
    const res = results[i];
    envelopes.push(res);
    data[key] = res.data?.products || [];
  });

  const meta = mergeMeta(envelopes);
  return ok(data, meta, 'inventory.attention');
}

export function formatInventoryAttentionMarkdown(envelope, { type = 'all' } = {}) {
  const { data, meta } = envelope;
  const sections = [];

  if ((type === 'all' || type === 'negative') && data.negative?.length) {
    sections.push(formatList('Negative stock — act today', data.negative));
  }
  if ((type === 'all' || type === 'low') && data.low?.length) {
    sections.push(formatList('Low stock — reorder candidates', data.low));
  }
  if ((type === 'all' || type === 'zero') && data.zero?.length) {
    sections.push(formatList('Zero stock — live but empty', data.zero));
  }
  if ((type === 'all' || type === 'high') && data.high?.length) {
    sections.push(formatList('Excess stock — consider promotions', data.high));
  }

  if (!sections.length) {
    return `## Inventory attention\n\nNo ${type === 'all' ? '' : `${type} `}stock issues in linked website listings.\n\n${provenanceFootnote(meta)}`;
  }

  return [`## Inventory attention`, '', ...sections, '', provenanceFootnote(meta)].join('\n');
}

function formatList(title, products) {
  const lines = [`### ${title}`, ''];
  for (const p of products) {
    const stock = p.stockOnHand != null ? `**${p.stockOnHand}** units` : 'stock n/a';
    lines.push(`- **${p.title}** (${p.sku}) — ${stock} · ${p.category}`);
  }
  return lines.join('\n');
}
