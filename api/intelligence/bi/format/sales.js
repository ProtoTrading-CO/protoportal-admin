import { provenanceFootnote, fmtDateTime } from '../shared/format.js';
import { readTrust } from '../shared/trust.js';

function formatEvidenceLine(label, field) {
  if (!field || field.value == null || field.value === '') return null;
  const src = String(field.source || 'unknown').replace(/_/g, ' ');
  const conf = field.confidence != null ? `${Math.round(field.confidence * 100)}%` : '—';
  const at = field.timestamp ? fmtDateTime(field.timestamp) : '—';
  return `- **${label}:** ${field.value} _(${src} · ${conf} · ${at})_`;
}

export function formatSalesContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No sales question specified.';

  if (data.taught === false || data.status?.code === 'not_taught') {
    return formatNotTaught(data, meta);
  }

  const periodLabel = data.periodLabel || String(data.period || '').replace(/_/g, ' ');
  const scopeLabel = String(data.scope || 'top_sellers').replace(/_/g, ' ');
  const lines = ['## Sales intelligence', ''];

  lines.push('_Source: website portal orders (not ERP POS totals yet)_', '');

  if (data.status?.code === 'no_orders' || !data.results?.length) {
    lines.push(`No portal orders found for **${periodLabel}**.`, '');
    lines.push('Try a wider period, or check that orders are flowing into the admin database.');
    lines.push('', provenanceFootnote(meta));
    return lines.join('\n');
  }

  const heading = data.scope === 'worst_sellers'
    ? `### Slowest movers — ${periodLabel}`
    : `### Top sellers — ${periodLabel}`;

  lines.push(heading, '');
  lines.push(`Based on **${data.orderCount}** portal order${data.orderCount === 1 ? '' : 's'}.`, '');

  for (const [i, item] of data.results.entries()) {
    lines.push(`${i + 1}. **${item.name}** (${item.code}) — **${item.totalQty}** units · ${item.orderCount} order${item.orderCount === 1 ? '' : 's'}`);
  }

  if (data.top && data.scope !== 'worst_sellers') {
    lines.push('', `**Best seller${periodLabel.includes('today') ? ' today' : ''}:** **${data.top.name}** (${data.top.code}) — **${data.top.totalQty}** units.`);
  }

  const ev = data.evidence || {};
  const evidenceLines = [
    formatEvidenceLine('Orders in period', ev.orderCount),
    formatEvidenceLine('Period', ev.period),
    formatEvidenceLine('Top item', ev.topItem),
  ].filter(Boolean);

  if (evidenceLines.length) {
    lines.push('', '### Evidence', ...evidenceLines);
  }

  const missing = (data.notAvailable || []).filter(Boolean);
  if (missing.length) {
    lines.push('', '### Not available yet', ...missing.map((f) => `- ${f.replace(/_/g, ' ')}`));
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}

function formatNotTaught(data, meta) {
  const scope = String(data.scope || 'top_sellers').replace(/_/g, ' ');
  const period = String(data.period || 'general').replace(/_/g, ' ');

  const lines = [
    '## Sales intelligence',
    '',
    "I understand what you're asking — **Sales Intelligence**.",
    '',
    "I don't yet have the knowledge to answer it reliably.",
    '',
    "Rather than guess, I'll tell you that **Sales Intelligence has not graduated yet**.",
    '',
    'It is planned as **Capability 1.3**.',
    '',
    `- **Scope detected:** ${scope}`,
    `- **Period detected:** ${period}`,
  ];

  if (data.query) {
    lines.push(`- **Your question:** ${data.query}`);
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}
