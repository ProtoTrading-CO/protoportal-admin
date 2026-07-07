import { fmtDate, fmtDateTime, money, provenanceFootnote } from '../shared/format.js';

export function formatDailyBriefContext(envelope) {
  const { data, meta } = envelope;
  const y = data.yesterday;
  const focus = data.focusToday || data.attention?.focus || [];

  const lines = [
    '## Daily Brief',
    '',
    `Good morning — here is what matters for **${fmtDate(new Date())}**.`,
    '',
    '### What changed yesterday',
  ];

  if (y.orderCount) {
    lines.push(`- **${y.orderCount} order${y.orderCount === 1 ? '' : 's'}** received · ${money(y.orderTotalExVat)} ex VAT`);
    for (const o of y.orders.slice(0, 5)) {
      lines.push(`  - ${fmtDateTime(o.createdAt)} · ${o.customer} · ${money(o.totalExVat)} · ${o.status}`);
    }
  } else {
    lines.push('- No portal orders recorded yesterday.');
  }

  if (y.listingsCount) {
    lines.push(`- **${y.listingsCount} website listing${y.listingsCount === 1 ? '' : 's'}** updated`);
    for (const p of y.listingsUpdated.slice(0, 3)) {
      lines.push(`  - ${p.title} (${p.sku})`);
    }
  } else {
    lines.push('- No website listing changes detected yesterday.');
  }

  lines.push('', '### Focus today');
  if (focus.length) {
    for (const item of focus) {
      lines.push(`- **${item.label}**${item.detail ? ` — ${item.detail}` : ''}`);
    }
  } else {
    lines.push('- Nothing urgent flagged. Review stock and orders when you have time.');
  }

  const neg = data.inventoryAlerts?.negative || [];
  if (neg.length) {
    lines.push('', '#### Negative stock');
    for (const p of neg.slice(0, 5)) {
      lines.push(`- **${p.title}** (${p.sku}) — **${p.stockQty}** units`);
    }
  }

  const pending = data.customerAlerts?.pending || [];
  if (pending.length) {
    lines.push('', '#### Customers to approve');
    for (const c of pending.slice(0, 5)) {
      lines.push(`- **${c.name}** — ${c.email}`);
    }
  }

  const quiet = data.quietSignals || data.safeToIgnore || [];
  if (quiet.length) {
    lines.push('', '### You can ignore for now');
    for (const note of quiet) lines.push(`- ${note}`);
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}

/** @deprecated use formatDailyBriefContext */
export const formatMorningBriefMarkdown = formatDailyBriefContext;
