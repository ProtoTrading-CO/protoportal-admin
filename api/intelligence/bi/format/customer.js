import { fmtDate, money, provenanceFootnote } from '../shared/format.js';

export function formatCustomerContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No customer specified.';

  if (data.matches?.length > 1 && !data.profile) {
    const lines = [
      `## Customer search: "${data.query}"`,
      '',
      'Multiple matches — be more specific:',
      '',
    ];
    for (const c of data.matches) {
      lines.push(`- **${c.name}** — ${c.email}${c.city ? ` · ${c.city}` : ''}`);
    }
    lines.push('', provenanceFootnote(meta));
    return lines.join('\n');
  }

  if (!data.profile) {
    return `## Customer\n\nNo customer found for **"${data.query || '—'}"**.\n\n${provenanceFootnote(meta)}`;
  }

  const p = data.profile;
  const c = data.contact;
  const lines = [
    `## ${p.business ? `${p.name} (${p.business})` : p.name}`,
    '',
    '### Profile',
    `- **Email:** ${c?.email || '—'}`,
    `- **Phone:** ${c?.phone || '—'}`,
    `- **Location:** ${[c?.city, c?.province].filter(Boolean).join(', ') || '—'}`,
    `- **Tier:** ${p.tier || '—'}`,
    `- **Approval:** ${data.approval?.approved ? 'Approved' : '**Pending approval**'}`,
    `- **Joined:** ${fmtDate(p.joined)}`,
    '',
    '### Orders (portal)',
    `- **Recent orders loaded:** ${data.orders?.count ?? 0}`,
    `- **Spend (loaded orders):** ${money(data.orders?.spendExVat)} ex VAT`,
  ];

  if (data.orders?.daysSinceLastOrder != null) {
    lines.push(`- **Days since last order:** ${data.orders.daysSinceLastOrder}`);
  }

  if (data.orders?.recent?.length) {
    lines.push('');
    for (const o of data.orders.recent.slice(0, 8)) {
      lines.push(`- ${fmtDate(o.createdAt)} · ${money(o.totalExVat)} · ${o.status}`);
    }
  } else {
    lines.push('', '_No portal orders on record for this customer._');
  }

  lines.push('', '### Not available');
  for (const field of data.notAvailable || []) {
    lines.push(`- ${field.replace(/_/g, ' ')}`);
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}
