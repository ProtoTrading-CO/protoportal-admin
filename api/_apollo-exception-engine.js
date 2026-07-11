const IMPACT_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_RANK = { critical: 4, action: 3, review: 2, info: 1 };

import { classifyNegativeStockList } from './_apollo-negative-stock-rules.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function codeOf(item) {
  return String(item?.code || item?.sku || item?.productId || '').trim().toUpperCase();
}

function titleOf(item) {
  return String(item?.name || item?.title || item?.description || codeOf(item) || 'Unknown item').trim();
}

function asMap(items = []) {
  return new Map(items.map((item, index) => [codeOf(item), { ...item, rank: index + 1 }]).filter(([code]) => code));
}

function pctChange(current, baseline) {
  const c = num(current);
  const b = num(baseline);
  if (b <= 0 && c > 0) return 100;
  if (b <= 0) return 0;
  return Math.round(((c - b) / b) * 100);
}

function severityFromImpact(impact) {
  if (impact === 'critical') return 'critical';
  if (impact === 'high') return 'action';
  if (impact === 'medium') return 'review';
  return 'info';
}

function priorityScore({ severity, businessImpact, confidence }) {
  return Math.min(99, Math.max(1,
    (SEVERITY_RANK[severity] || 1) * 18
    + (IMPACT_RANK[businessImpact] || 1) * 10
    + Math.round(num(confidence) / 4),
  ));
}

function exception({
  type,
  category,
  key,
  title,
  detail,
  recommendation,
  severity,
  confidence,
  businessImpact,
  evidence = [],
  query = '',
  sourceType = 'business_exception',
  sourceId = null,
}) {
  const impact = businessImpact || 'medium';
  const sev = severity || severityFromImpact(impact);
  return {
    dedupeKey: `exception:${type}:${key}`,
    sourceType,
    sourceId,
    workspaceId: null,
    category,
    severity: sev,
    title,
    detail,
    recommendation,
    actionLabel: query ? 'Ask Apollo' : 'Review exception',
    actionUrl: '',
    priorityScore: priorityScore({ severity: sev, businessImpact: impact, confidence }),
    dueAt: null,
    payload: {
      type,
      confidence,
      businessImpact: impact,
      evidence,
      query,
      release: 'apollo-operational-v1.2',
    },
  };
}

export function detectSalesAnomalies({ today = [], baseline = [] } = {}) {
  const baselineByCode = asMap(baseline);
  const items = [];

  for (const item of today.slice(0, 15)) {
    const code = codeOf(item);
    if (!code) continue;
    const currentQty = num(item.totalQty);
    const base = baselineByCode.get(code);
    const baselineQty = base ? Math.max(1, num(base.totalQty) / 7) : 0;
    const change = pctChange(currentQty, baselineQty);
    const unexpected = !base && currentQty >= 5;
    if (!unexpected && Math.abs(change) < 35) continue;

    const spike = unexpected || change > 0;
    const impact = currentQty >= 25 || Math.abs(change) >= 80 ? 'high' : 'medium';
    const confidence = Math.min(96, Math.max(68, 72 + Math.min(18, Math.abs(change) / 5) + (base ? 6 : 0)));
    items.push(exception({
      type: 'sales_anomaly',
      category: 'sales_anomaly',
      key: `${code}:${spike ? 'spike' : 'drop'}`,
      title: `${code} · ${titleOf(item)} sales ${spike ? 'spiked' : 'dropped'}`,
      detail: unexpected
        ? `${code} appeared as an unexpected bestseller with ${currentQty} units`
        : `${code} is ${Math.abs(change)}% ${spike ? 'above' : 'below'} recent trend`,
      recommendation: spike ? 'Review stock cover before demand outruns supply.' : 'Check whether demand has slowed or stock/listing issues are suppressing sales.',
      businessImpact: impact,
      confidence: Math.round(confidence),
      evidence: [
        { label: 'Current quantity', value: currentQty },
        { label: 'Recent daily baseline', value: Math.round(baselineQty * 10) / 10 },
        { label: 'Change', value: `${change}%` },
      ],
      query: `Show product ${code}`,
    }));
  }

  return items;
}

export function detectErpWebsiteExceptions({ products = [] } = {}) {
  const items = [];
  for (const row of products) {
    const code = codeOf(row);
    if (!code) continue;
    const erp = row.erp || row.erpProduct || null;
    const website = row.website || row.listing || null;
    const name = titleOf(website || erp || row);

    if (!website && erp) {
      items.push(exception({
        type: 'erp_website_exception',
        category: 'erp_website_exception',
        key: `${code}:missing-website`,
        title: `${name} is missing from the website`,
        detail: `${code} exists in ERP but has no website listing`,
        recommendation: 'Investigate catalogue synchronisation.',
        businessImpact: 'medium',
        confidence: 90,
        evidence: [{ label: 'ERP product', value: 'present' }, { label: 'Website listing', value: 'missing' }],
        query: `Show product ${code}`,
      }));
      continue;
    }

    if (website && !erp) {
      items.push(exception({
        type: 'erp_website_exception',
        category: 'erp_website_exception',
        key: `${code}:missing-erp`,
        title: `${name} is missing from ERP`,
        detail: `${code} is listed on the website but was not found in ERP/cache`,
        recommendation: 'Investigate product master synchronisation.',
        businessImpact: 'high',
        confidence: 88,
        evidence: [{ label: 'Website listing', value: 'present' }, { label: 'ERP product', value: 'missing' }],
        query: `Show product ${code}`,
      }));
      continue;
    }

    if (!website || !erp) continue;
    const erpStock = num(erp.onhand ?? erp.stockQty ?? erp.stock_on_hand, null);
    const websiteStock = num(website.available_stock ?? website.stock_qty ?? website.stockQty, null);
    if (erpStock != null && websiteStock != null) {
      const diff = erpStock - websiteStock;
      if (Math.abs(diff) >= 10 || Math.abs(diff) >= Math.max(3, Math.abs(erpStock) * 0.2)) {
        const impact = Math.abs(diff) >= 50 || websiteStock <= 0 ? 'high' : 'medium';
        items.push(exception({
          type: 'erp_website_exception',
          category: 'erp_website_exception',
          key: `${code}:stock-mismatch`,
          title: `${name} stock differs between ERP and website`,
          detail: `${code} ERP stock ${erpStock}, website stock ${websiteStock}`,
          recommendation: 'Investigate stock synchronisation before customers see the wrong availability.',
          businessImpact: impact,
          confidence: 92,
          evidence: [{ label: 'ERP stock', value: erpStock }, { label: 'Website stock', value: websiteStock }, { label: 'Difference', value: diff }],
          query: `Show product ${code}`,
        }));
      }
    }

    const erpPrice = num(erp.price_a ?? erp.price ?? erp.priceExVat, null);
    const websitePrice = num(website.price ?? website.price_ex_vat, null);
    if (erpPrice != null && websitePrice != null && erpPrice > 0) {
      const priceChange = Math.abs(pctChange(websitePrice, erpPrice));
      if (priceChange >= 10) {
        items.push(exception({
          type: 'erp_website_exception',
          category: 'erp_website_exception',
          key: `${code}:price-mismatch`,
          title: `${name} price differs between ERP and website`,
          detail: `${code} ERP price ${erpPrice}, website price ${websitePrice}`,
          recommendation: 'Investigate pricing synchronisation before quoting or selling at the wrong price.',
          businessImpact: priceChange >= 25 ? 'high' : 'medium',
          confidence: 91,
          evidence: [{ label: 'ERP price', value: erpPrice }, { label: 'Website price', value: websitePrice }, { label: 'Difference', value: `${priceChange}%` }],
          query: `Show product ${code}`,
        }));
      }
    }
  }
  return items;
}

export function detectStockCoverRisks({ products = [] } = {}) {
  return products.flatMap((row) => {
    const code = codeOf(row);
    const stock = num(row.stockQty ?? row.stockOnHand ?? row.availableStock);
    const velocity = num(row.dailySalesVelocity ?? row.recentDailySales);
    const leadTimeDays = num(row.leadTimeDays, 35);
    if (!code || velocity <= 0) return [];

    const coverDays = Math.round((stock / velocity) * 10) / 10;
    const impact = coverDays <= 7 ? 'critical' : coverDays <= leadTimeDays ? 'high' : coverDays <= leadTimeDays * 1.5 ? 'medium' : 'low';
    if (impact === 'low') return [];
    const confidence = Math.min(96, Math.max(70, 78 + (row.salesSampleDays >= 7 ? 8 : 0) + (row.leadTimeDays ? 6 : 0)));
    const action = coverDays <= leadTimeDays ? 'Order now' : 'Monitor';
    return [exception({
      type: 'stock_cover_risk',
      category: 'stock_cover_risk',
      key: code,
      title: `${titleOf(row)} stock cover is ${coverDays} days`,
      detail: `${code} has ${stock} units, selling about ${velocity}/day, lead time ${leadTimeDays} days`,
      recommendation: `${action}. Current cover is below the supplier lead-time window.`,
      businessImpact: impact,
      confidence,
      evidence: [
        { label: 'Current stock', value: stock },
        { label: 'Daily sales velocity', value: velocity },
        { label: 'Stock cover', value: `${coverDays} days` },
        { label: 'Supplier lead time', value: `${leadTimeDays} days` },
      ],
      query: `Show product ${code}`,
    })];
  });
}

export function detectCustomerBehaviourChanges({ customers = [] } = {}) {
  return customers.flatMap((customer) => {
    const name = customer.name || customer.customer || customer.email || 'Customer';
    const normalGap = num(customer.normalOrderGapDays);
    const currentGap = num(customer.daysSinceLastOrder);
    const avgOrderValue = num(customer.averageOrderValue);
    const latestOrderValue = num(customer.latestOrderValue);
    const confidenceBase = customer.orderCount >= 4 ? 82 : 64;
    const items = [];

    if (normalGap > 0 && currentGap >= normalGap * 1.8 && confidenceBase >= 80) {
      items.push(exception({
        type: 'customer_behaviour_change',
        category: 'customer_behaviour_change',
        key: `${customer.id || name}:inactive`,
        title: `${name} is quieter than normal`,
        detail: `Usually orders every ${normalGap} days; now quiet for ${currentGap} days`,
        recommendation: 'Follow up only if the relationship is active and the customer is worth retaining.',
        businessImpact: customer.totalSpend >= 10000 ? 'high' : 'medium',
        confidence: confidenceBase + 8,
        evidence: [{ label: 'Normal order gap', value: `${normalGap} days` }, { label: 'Current gap', value: `${currentGap} days` }, { label: 'Historical orders', value: customer.orderCount }],
        query: customer.email ? `Find customer ${customer.email}` : `Find customer ${name}`,
      }));
    }

    const valueChange = pctChange(latestOrderValue, avgOrderValue);
    if (avgOrderValue > 0 && Math.abs(valueChange) >= 40 && confidenceBase >= 80) {
      items.push(exception({
        type: 'customer_behaviour_change',
        category: 'customer_behaviour_change',
        key: `${customer.id || name}:aov-${valueChange > 0 ? 'up' : 'down'}`,
        title: `${name} order value changed`,
        detail: `Latest order is ${Math.abs(valueChange)}% ${valueChange > 0 ? 'above' : 'below'} normal`,
        recommendation: valueChange > 0 ? 'Check whether this signals a new buying opportunity.' : 'Check whether the customer is reducing spend or buying elsewhere.',
        businessImpact: Math.abs(valueChange) >= 75 ? 'high' : 'medium',
        confidence: confidenceBase,
        evidence: [{ label: 'Average order value', value: avgOrderValue }, { label: 'Latest order value', value: latestOrderValue }, { label: 'Change', value: `${valueChange}%` }],
        query: customer.email ? `Find customer ${customer.email}` : `Find customer ${name}`,
      }));
    }

    return items;
  });
}

export function detectSupplierDelays({ suppliers = [] } = {}) {
  return suppliers.flatMap((supplier) => {
    const name = supplier.name || supplier.supplier;
    if (!name) return [];
    const late = num(supplier.lateDeliveries);
    const outstanding = num(supplier.outstandingCommitments);
    const avgLead = num(supplier.averageLeadTimeDays);
    const normalLead = num(supplier.normalLeadTimeDays);
    const leadChange = pctChange(avgLead, normalLead);
    if (late < 2 && outstanding < 2 && leadChange < 25) return [];

    const impact = late >= 3 || outstanding >= 4 || leadChange >= 50 ? 'high' : 'medium';
    const confidence = Math.min(95, 74 + Math.min(10, late * 3) + Math.min(8, outstanding * 2) + (normalLead ? 6 : 0));
    return [exception({
      type: 'supplier_delay',
      category: 'supplier_delay',
      key: String(name).toLowerCase(),
      title: `${name} supplier delay risk`,
      detail: `${late} late delivery${late === 1 ? '' : 'ies'} · ${outstanding} outstanding commitment${outstanding === 1 ? '' : 's'}`,
      recommendation: 'Follow up with the supplier and confirm dates before customer commitments slip.',
      businessImpact: impact,
      confidence,
      evidence: [
        { label: 'Late deliveries', value: late },
        { label: 'Outstanding commitments', value: outstanding },
        { label: 'Average lead time', value: avgLead ? `${avgLead} days` : 'unknown' },
        { label: 'Lead time change', value: normalLead ? `${leadChange}%` : 'unknown' },
      ],
      query: String(name),
    })];
  });
}

export function detectNegativeStockInvestigations({ products = [], sales = null, existingByKey = null, now = new Date() } = {}) {
  return classifyNegativeStockList(products, { sales, existingByKey, now })
    .filter((row) => row.kind === 'investigate')
    .map((row) => exception({
      type: 'negative_stock_investigation',
      category: 'negative_stock_investigation',
      key: row.code,
      title: row.title,
      detail: row.detail,
      recommendation: row.recommendation,
      severity: 'action',
      businessImpact: 'high',
      confidence: 88,
      evidence: [
        { label: 'On hand', value: row.stockQty },
        { label: 'Persisted hours', value: row.persistedHours || 24 },
        { label: 'GRV pending', value: row.pendingGrv ? 'yes' : 'no' },
      ],
      query: `Show product ${row.code}`,
    }));
}

export function buildBusinessExceptions(source = {}) {
  const items = [
    ...detectSalesAnomalies(source.sales || {}),
    ...detectErpWebsiteExceptions(source.erpWebsite || {}),
    ...detectStockCoverRisks(source.stockCover || {}),
    ...detectCustomerBehaviourChanges(source.customers || {}),
    ...detectSupplierDelays(source.suppliers || {}),
    ...detectNegativeStockInvestigations(source.negativeStock || {}),
  ];

  return items.sort((a, b) => {
    const impact = (IMPACT_RANK[b.payload?.businessImpact] || 0) - (IMPACT_RANK[a.payload?.businessImpact] || 0);
    if (impact) return impact;
    return b.priorityScore - a.priorityScore || String(a.title).localeCompare(String(b.title));
  });
}
