import { executeQuery } from '../../query-engine/execute.js';
import { ok } from '../../query-engine/envelope.js';
import { fmtDate, fmtDateTime, mergeMeta, money, provenanceFootnote } from './shared/format.js';

const NOT_AVAILABLE_CUSTOMER = [
  'outstanding_balance',
  'margin',
  'erp_departments',
  'erp_sales_history',
  'health_score',
];

export async function buildCustomerContext(params = {}, ctx = {}) {
  const q = String(params.q || params.email || params.name || '').trim();
  const id = String(params.id || '').trim();

  let customer = null;
  let searchRes = null;
  let idRes = null;

  if (id) {
    idRes = await executeQuery('portal.customer_by_id', { id }, ctx);
    if (!idRes.ok) return idRes;
    customer = idRes.data?.customer || null;
  } else if (q) {
    searchRes = await executeQuery('portal.customers_search', { q, limit: 5 }, ctx);
    if (!searchRes.ok) return searchRes;
    const hits = searchRes.data?.customers || [];
    if (hits.length === 1) {
      customer = hits[0];
    } else if (hits.length > 1) {
      return ok({
        matches: hits,
        customer: null,
        notAvailable: NOT_AVAILABLE_CUSTOMER,
      }, searchRes.meta, 'customer.context');
    }
  }

  if (!customer) {
    const meta = mergeMeta([idRes, searchRes].filter(Boolean));
    return ok({
      customer: null,
      matches: searchRes?.data?.customers || [],
      query: q || id,
      notAvailable: NOT_AVAILABLE_CUSTOMER,
    }, meta, 'customer.context');
  }

  const ordersRes = await executeQuery('portal.orders_by_customer', { customerId: customer.id, limit: 20 }, ctx);
  if (!ordersRes.ok) return ordersRes;

  const orders = ordersRes.data?.orders || [];
  const orderCount = orders.length;
  const spendExVat = orders.reduce((s, o) => s + (Number(o.totalExVat) || 0), 0);

  const data = {
    customer: {
      id: customer.id,
      name: customer.name || customer.business_name || '—',
      email: customer.email,
      phone: customer.phone,
      business: customer.business_name,
      businessType: customer.business_type,
      city: customer.city,
      province: customer.province,
      tier: customer.tier,
      approved: customer.is_approved,
      joined: customer.created_at,
    },
    recentOrders: orders,
    orderCount,
    spendExVat,
    notAvailable: [...NOT_AVAILABLE_CUSTOMER],
  };

  const meta = mergeMeta([idRes, searchRes, ordersRes].filter(Boolean));
  return ok(data, meta, 'customer.context');
}

export function formatCustomerContextMarkdown(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No customer specified.';

  if (data.matches?.length > 1 && !data.customer) {
    const lines = [
      `## Customer search: "${data.query}"`,
      '',
      'Multiple matches — be more specific:',
      '',
    ];
    for (const c of data.matches) {
      lines.push(`- **${c.business_name || c.name}** — ${c.email}${c.city ? ` · ${c.city}` : ''}`);
    }
    lines.push('', provenanceFootnote(meta));
    return lines.join('\n');
  }

  if (!data.customer) {
    return `## Customer\n\nNo customer found for **"${data.query || '—'}"**.\n\n${provenanceFootnote(meta)}`;
  }

  const c = data.customer;
  const lines = [
    `## ${c.business ? `${c.name} (${c.business})` : c.name}`,
    '',
    '### Profile',
    `- **Email:** ${c.email || '—'}`,
    `- **Phone:** ${c.phone || '—'}`,
    `- **Location:** ${[c.city, c.province].filter(Boolean).join(', ') || '—'}`,
    `- **Tier:** ${c.tier || '—'}`,
    `- **Approval:** ${c.approved ? 'Approved' : '**Pending approval**'}`,
    `- **Joined:** ${fmtDate(c.joined)}`,
    '',
    '### Orders (portal)',
    `- **Recent orders loaded:** ${data.orderCount}`,
    `- **Spend (loaded orders):** ${money(data.spendExVat)} ex VAT`,
  ];

  if (data.recentOrders?.length) {
    lines.push('');
    for (const o of data.recentOrders.slice(0, 8)) {
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
