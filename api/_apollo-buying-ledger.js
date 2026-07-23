import { getPortalAdminClient } from './_site-config.js';

const ACTIVE_SHIPMENT_STATUSES = new Set([
  'Ordered', 'Departed', 'On the water', 'Customs', 'Landed — awaiting GRV', 'Partially received',
]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameText(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Reads buyer-entered inputs only. POSWINSQL remains the source of live stock
 * and demand; this ledger supplies explicit supplier and incoming-stock facts.
 */
export async function readBuyingLedger(sku, supplier = '') {
  const code = String(sku || '').trim().toUpperCase();
  if (!code) return { rule: null, incoming: [], incomingBeforeLeadTime: 0, incomingTotal: 0 };

  const supabase = getPortalAdminClient();
  const { data: rules, error: ruleError } = await supabase
    .from('apollo_supplier_sku_settings')
    .select('supplier,sku,lead_time_days,moq,pack_size,target_cover_months,notes,updated_at')
    .eq('sku', code)
    .order('updated_at', { ascending: false })
    .limit(12);
  if (ruleError) throw ruleError;

  const rule = (rules || []).find((row) => sameText(row.supplier, supplier))
    || (rules || []).find((row) => !String(row.supplier || '').trim())
    || null;

  const { data: lines, error: lineError } = await supabase
    .from('apollo_incoming_shipment_lines')
    .select('shipment_id,sku,quantity,shipment:apollo_incoming_shipments!inner(shipment_ref,supplier,eta,status)')
    .eq('sku', code);
  if (lineError) throw lineError;

  const shipmentIds = [...new Set((lines || []).map((line) => line.shipment_id).filter(Boolean))];
  let receiptRows = [];
  if (shipmentIds.length) {
    const { data, error } = await supabase
      .from('apollo_incoming_receipts')
      .select('shipment_id,sku,quantity')
      .eq('sku', code)
      .in('shipment_id', shipmentIds);
    if (error) throw error;
    receiptRows = data || [];
  }

  const receivedByShipment = new Map();
  for (const receipt of receiptRows) {
    receivedByShipment.set(receipt.shipment_id, number(receivedByShipment.get(receipt.shipment_id)) + number(receipt.quantity));
  }

  const incoming = (lines || []).map((line) => {
    const shipment = Array.isArray(line.shipment) ? line.shipment[0] : line.shipment;
    const outstanding = Math.max(0, number(line.quantity) - number(receivedByShipment.get(line.shipment_id)));
    return {
      shipmentRef: String(shipment?.shipment_ref || ''),
      supplier: String(shipment?.supplier || ''),
      eta: isoDate(shipment?.eta),
      status: String(shipment?.status || ''),
      outstanding,
    };
  }).filter((line) => ACTIVE_SHIPMENT_STATUSES.has(line.status) && line.outstanding > 0);

  const now = new Date();
  const leadTimeDays = Number(rule?.lead_time_days);
  const arrivalDeadline = Number.isFinite(leadTimeDays)
    ? new Date(now.getTime() + Math.max(0, leadTimeDays) * 86_400_000)
    : null;
  const incomingBeforeLeadTime = arrivalDeadline
    ? incoming.filter((line) => line.eta && new Date(`${line.eta}T23:59:59Z`) <= arrivalDeadline)
      .reduce((total, line) => total + line.outstanding, 0)
    : 0;

  return {
    rule,
    incoming,
    incomingTotal: incoming.reduce((total, line) => total + line.outstanding, 0),
    incomingBeforeLeadTime,
  };
}

export function calculateBuyerQuantity({ available, monthlyVelocity, rule, incomingBeforeLeadTime }) {
  if (!rule || !(monthlyVelocity > 0)) return null;
  const leadTimeDays = Math.max(0, number(rule.lead_time_days));
  const targetCoverMonths = Math.max(0.5, number(rule.target_cover_months) || 3);
  const monthsToArrival = leadTimeDays / 30.44;
  const projectedAtArrival = number(available) + number(incomingBeforeLeadTime) - (monthlyVelocity * monthsToArrival);
  const raw = Math.max(0, (monthlyVelocity * targetCoverMonths) - projectedAtArrival);
  if (raw <= 0) return { quantity: 0, raw, projectedAtArrival, targetCoverMonths, leadTimeDays };

  const minimum = Math.max(0, number(rule.moq));
  const pack = number(rule.pack_size);
  let quantity = Math.max(raw, minimum);
  if (pack > 0) quantity = Math.ceil(quantity / pack) * pack;
  else quantity = Math.ceil(quantity);
  return { quantity, raw, projectedAtArrival, targetCoverMonths, leadTimeDays };
}
