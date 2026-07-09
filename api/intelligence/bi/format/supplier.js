import { provenanceFootnote } from '../shared/format.js';

export function formatSupplierContext(envelope) {
  const { data, meta } = envelope;
  if (!data?.name) {
    return `## Supplier\n\nNo supplier name provided.\n\n${provenanceFootnote(meta)}`;
  }

  const lines = [
    `## Supplier — ${data.name}`,
    '',
    `**Status:** ${data.status?.label || '—'}`,
    '',
    '### Supplier intelligence',
    '',
    '- **Lead times:** not yet available',
    '- **Delays:** not yet available',
    '- **Quality:** not yet available',
    '- **Reliability:** not yet available',
    '',
  ];

  if (data.stub) {
    lines.push('_Supplier Context is a stub — Capability 4 will connect ERP and Apollo Memory._', '');
  }

  if (data.notAvailable?.length) {
    lines.push('**Not yet available:** ' + data.notAvailable.join(', '), '');
  }

  lines.push(provenanceFootnote(meta));
  return lines.join('\n');
}
