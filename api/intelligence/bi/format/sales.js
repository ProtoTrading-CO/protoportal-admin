import { provenanceFootnote, fmtDateTime } from '../shared/format.js';

function formatEvidenceLine(label, field) {
  if (!field || field.value == null || field.value === '') return null;
  const src = String(field.source || 'unknown').replace(/_/g, ' ');
  const conf = field.confidence != null ? `${Math.round(field.confidence * 100)}%` : '—';
  const at = field.timestamp ? fmtDateTime(field.timestamp) : '—';
  return `- **${label}:** ${field.value} _(${src} · ${conf} · ${at})_`;
}

function sourceLabel(data) {
  if (data.dataSource === 'positill_erp') {
    return '_Source: Positill POS (live ERP invoices on BLADERUNNER)_';
  }
  return '_Source: website portal orders (you asked for website sales)_';
}

function countLabel(data) {
  if (data.dataSource === 'positill_erp') {
    const n = data.invoiceCount ?? data.orderCount ?? 0;
    return `Based on **${n}** Positill invoice${n === 1 ? '' : 's'}.`;
  }
  return `Based on **${data.orderCount}** portal order${data.orderCount === 1 ? '' : 's'}.`;
}

export function formatSalesContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No sales question specified.';

  if (data.taught === false || data.status?.code === 'not_taught') {
    return formatNotTaught(data, meta);
  }

  const periodLabel = data.periodLabel || String(data.period || '').replace(/_/g, ' ');
  const lines = ['## Sales intelligence', ''];

  lines.push(sourceLabel(data), '');

  const empty = data.status?.code === 'no_sales' || data.status?.code === 'no_orders' || !data.results?.length;
  if (empty) {
    const noun = data.dataSource === 'positill_erp' ? 'Positill sales' : 'portal orders';
    lines.push(`No ${noun} found for **${periodLabel}**.`, '');
    if (data.dataSource === 'positill_erp') {
      lines.push('This reflects live POS invoices. Ask for **website sales** if you want portal orders.');
    } else {
      lines.push('Try a wider period.');
    }
    lines.push('', provenanceFootnote(meta));
    return lines.join('\n');
  }

  const heading = data.scope === 'worst_sellers'
    ? `### Slowest movers — ${periodLabel}`
    : `### Top sellers — ${periodLabel}`;

  lines.push(heading, '');
  lines.push(countLabel(data), '');

  for (const [i, item] of data.results.entries()) {
    const name = item.name || item.title || item.code;
    const inv = item.invoiceCount ?? item.orderCount;
    const invPart = inv != null ? ` · ${inv} invoice${inv === 1 ? '' : 's'}` : '';
    lines.push(`${i + 1}. **${name}** (${item.code}) — **${item.totalQty}** units${invPart}`);
  }

  if (data.top && data.scope !== 'worst_sellers') {
    const topName = data.top.name || data.top.title || data.top.code;
    lines.push('', `**Best seller${periodLabel.includes('today') ? ' today' : ''}:** **${topName}** (${data.top.code}) — **${data.top.totalQty}** units.`);
  }

  const ev = data.evidence || {};
  const countField = data.dataSource === 'positill_erp' ? ev.invoiceCount : ev.orderCount;
  const evidenceLines = [
    formatEvidenceLine(data.dataSource === 'positill_erp' ? 'Invoices in period' : 'Orders in period', countField),
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
