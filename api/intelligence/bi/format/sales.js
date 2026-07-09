import { provenanceFootnote } from '../shared/format.js';

const AVAILABLE_NOW = [
  'Product lookups (live ERP when bridge is on)',
  'Customer lookups',
  'Supplier lookups',
  'Inventory attention (low / negative stock)',
  'Daily brief & business health',
];

const SALES_WHEN_TAUGHT = [
  'What sold best today?',
  'Fastest-growing products',
  'Worst sellers',
  'Sales trends',
  'Revenue leaders',
];

export function formatSalesContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No sales question specified.';

  if (data.taught === false || data.status?.code === 'not_taught') {
    return formatNotTaught(data, meta);
  }

  // Future: graduated sales context with evidence
  const lines = ['## Sales intelligence', ''];
  lines.push(provenanceFootnote(meta));
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

  lines.push(
    '',
    '### What I can help with today',
    ...AVAILABLE_NOW.map((item) => `- ${item}`),
    '',
    '### Once Sales Intelligence is taught, I\'ll be able to answer questions like:',
    ...SALES_WHEN_TAUGHT.map((item) => `- ${item}`),
    '',
    provenanceFootnote(meta),
  );

  return lines.join('\n');
}
