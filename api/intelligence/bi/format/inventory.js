import { provenanceFootnote } from '../shared/format.js';

const SECTION_TITLES = {
  negative: 'Negative stock — act today',
  low: 'Low stock — reorder candidates',
  zero: 'Zero stock — live but empty',
  high: 'Excess stock — consider promotions',
};

export function formatInventoryContext(envelope, { type = 'all' } = {}) {
  const { data, meta } = envelope;
  const lists = data?.lists || data || {};
  const sections = [];

  for (const key of ['negative', 'low', 'zero', 'high']) {
    if (type !== 'all' && type !== key) continue;
    const items = lists[key] || [];
    if (items.length) sections.push(formatList(SECTION_TITLES[key], items));
  }

  if (!sections.length) {
    return `## Inventory attention\n\nNo ${type === 'all' ? '' : `${type} `}stock issues in linked website listings.\n\n${provenanceFootnote(meta)}`;
  }

  return [`## Inventory attention`, '', ...sections, '', provenanceFootnote(meta)].join('\n');
}

function formatList(title, items) {
  const lines = [`### ${title}`, ''];
  for (const p of items) {
    const stock = p.stockQty != null ? `**${p.stockQty}** units` : 'stock n/a';
    const supplier = p.supplier ? ` · ${p.supplier}` : '';
    lines.push(`- **${p.title}** (${p.sku}) — ${stock}${supplier}`);
    if (p.reason) lines.push(`  _${p.reason}_`);
  }
  return lines.join('\n');
}
