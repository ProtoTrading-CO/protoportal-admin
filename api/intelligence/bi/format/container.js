import { provenanceFootnote } from '../shared/format.js';

export function formatContainerContext(envelope) {
  const { data, meta } = envelope;
  if (!data?.reference) {
    return `## Container\n\nNo container reference provided.\n\n${provenanceFootnote(meta)}`;
  }

  const lines = [
    `## ${data.reference}`,
    '',
    `**Status:** ${data.status?.label || '—'}`,
    '',
    '### Shipment',
    '',
    '- **Arrival:** not yet available',
    '- **Supplier:** not yet available',
    '- **Lines:** not yet available',
    '',
  ];

  if (data.stub) {
    lines.push('_Container Context is a stub — ERP container data will be wired in a later capability._', '');
  }

  if (data.notAvailable?.length) {
    lines.push('**Not yet available:** ' + data.notAvailable.join(', '), '');
  }

  lines.push(provenanceFootnote(meta));
  return lines.join('\n');
}
