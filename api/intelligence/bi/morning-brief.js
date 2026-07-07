import { executeQuery } from '../../query-engine/execute.js';
import { ok, WARNING_CODES } from '../../query-engine/envelope.js';
import { fmtDate, fmtDateTime, mergeMeta, money, provenanceFootnote, startOfToday, startOfYesterday } from './shared/format.js';

const REVIEW_STATUSES = new Set(['pending', 'order in progress']);

export async function buildMorningBrief(ctx = {}) {
  const yesterday = startOfYesterday();
  const today = startOfToday();
  const qCtx = { ...ctx, bypassCache: ctx.bypassCache };

  const [
    ordersRes,
    pendingRes,
    listingsRes,
    negativeRes,
    lowRes,
    zeroRes,
  ] = await Promise.all([
    executeQuery('portal.orders_recent', { limit: 100 }, qCtx),
    executeQuery('portal.customers_pending', { limit: 25 }, qCtx),
    executeQuery('stock.listings_since', { since: yesterday.toISOString(), limit: 50 }, qCtx),
    executeQuery('stock.negative_stock_list', { limit: 10 }, qCtx),
    executeQuery('stock.low_stock_list', { limit: 10, threshold: 10 }, qCtx),
    executeQuery('stock.zero_stock_list', { limit: 10 }, qCtx),
  ]);

  const envelopes = [ordersRes, pendingRes, listingsRes, negativeRes, lowRes, zeroRes];
  const failed = envelopes.find((e) => !e.ok);
  if (failed) return failed;

  const orders = ordersRes.data.orders || [];
  const ordersYesterday = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= yesterday.getTime() && t < today.getTime();
  });
  const ordersYesterdayTotal = ordersYesterday.reduce((s, o) => s + (Number(o.totalExVat) || 0), 0);
  const needsReview = orders.filter((o) => REVIEW_STATUSES.has(String(o.status || '').toLowerCase()));

  const pendingCustomers = pendingRes.data.customers || [];
  const listingsUpdated = listingsRes.data.listings || [];
  const negative = negativeRes.data.products || [];
  const low = lowRes.data.products || [];
  const zero = zeroRes.data.products || [];

  const focus = [];
  if (negative.length) {
    focus.push({
      type: 'negative_stock',
      priority: 1,
      label: `${negative.length}+ products with negative stock`,
      detail: negative[0] ? `${negative[0].title} (${negative[0].sku}) at ${negative[0].stockOnHand}` : '',
    });
  }
  if (pendingCustomers.length) {
    focus.push({
      type: 'pending_customers',
      priority: 2,
      label: `${pendingCustomers.length} customer${pendingCustomers.length === 1 ? '' : 's'} awaiting approval`,
      detail: pendingCustomers[0] ? `${pendingCustomers[0].business_name || pendingCustomers[0].name} — ${pendingCustomers[0].email}` : '',
    });
  }
  if (needsReview.length) {
    focus.push({
      type: 'orders_review',
      priority: 3,
      label: `${needsReview.length} recent order${needsReview.length === 1 ? '' : 's'} need review`,
      detail: needsReview[0] ? `${needsReview[0].customer} · ${needsReview[0].status}` : '',
    });
  }
  if (zero.length) {
    focus.push({
      type: 'zero_stock',
      priority: 4,
      label: `${zero.length}+ live listings at zero stock`,
      detail: zero[0] ? `${zero[0].title} (${zero[0].sku})` : '',
    });
  }
  focus.sort((a, b) => a.priority - b.priority);

  const data = {
    yesterday: {
      orders: ordersYesterday,
      orderCount: ordersYesterday.length,
      orderTotalExVat: ordersYesterdayTotal,
      listingsUpdated,
      listingsCount: listingsUpdated.length,
      customersApproved: [],
    },
    attention: {
      focus,
      negativeStock: negative,
      lowStock: low,
      zeroStock: zero,
      pendingCustomers,
      ordersNeedingReview: needsReview.slice(0, 10),
    },
    safeToIgnore: buildSafeToIgnore({ ordersYesterday, negative, pendingCustomers, needsReview, low }),
  };

  const meta = mergeMeta(envelopes);
  return ok(data, meta, 'brief.morning');
}

function buildSafeToIgnore({ ordersYesterday, negative, pendingCustomers, needsReview, low }) {
  const notes = [];
  if (!ordersYesterday.length) notes.push('No new portal orders yesterday.');
  if (!negative.length && !low.length) notes.push('No urgent stock emergencies in linked listings.');
  if (!pendingCustomers.length) notes.push('No customers waiting for approval.');
  if (!needsReview.length) notes.push('No orders flagged for immediate review.');
  return notes;
}

export function formatMorningBriefMarkdown(envelope) {
  const { data, meta } = envelope;
  const y = data.yesterday;
  const a = data.attention;

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
  if (a.focus.length) {
    for (const item of a.focus) {
      lines.push(`- **${item.label}**${item.detail ? ` — ${item.detail}` : ''}`);
    }
  } else {
    lines.push('- Nothing urgent flagged. Review stock and orders when you have time.');
  }

  if (a.negativeStock.length) {
    lines.push('', '#### Negative stock');
    for (const p of a.negativeStock.slice(0, 5)) {
      lines.push(`- **${p.title}** (${p.sku}) — **${p.stockOnHand}** units`);
    }
  }

  if (a.pendingCustomers.length) {
    lines.push('', '#### Customers to approve');
    for (const c of a.pendingCustomers.slice(0, 5)) {
      lines.push(`- **${c.business_name || c.name}** — ${c.email}`);
    }
  }

  if (data.safeToIgnore?.length) {
    lines.push('', '### You can ignore for now');
    for (const note of data.safeToIgnore) lines.push(`- ${note}`);
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}
