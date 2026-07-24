import { requireAdminKey, verifyAdminUser } from './_admin-auth.js';
import { getPortalAdminClient } from './_site-config.js';

const SHIPMENT_STATUSES = new Set([
  'Ordered', 'Departed', 'On the water', 'Customs', 'Landed â awaiting GRV', 'Partially received', 'Received', 'Cancelled',
]);
const SHIPMENT_METHODS = new Set(['Container', 'Air']);

function text(value) {
  return String(value || '').trim();
}

function sku(value) {
  return text(value).toUpperCase();
}

function numeric(value, { minimum = 0, nullable = true } = {}) {
  if (value === '' || value === null || value === undefined) return nullable ? null : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error('Enter a valid non-negative number');
  return parsed;
}

function date(value, label = 'Date') {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label} is required`);
  return result;
}

function actionError(res, error) {
  const message = String(error?.message || 'Buying ledger request failed');
  const status = /required|valid|between|must|already exists|duplicate/i.test(message) ? 400 : 500;
  return res.status(status).json({ error: message });
}

async function actor(req) {
  const user = await verifyAdminUser(req);
  return user?.email || 'apollo';
}

async function loadLedger(supabase) {
  const [rules, shipments, lines, receipts] = await Promise.all([
    supabase.from('apollo_supplier_sku_settings')
      .select('id,supplier,sku,lead_time_days,moq,pack_size,target_cover_months,notes,updated_at')
      .order('updated_at', { ascending: false }).limit(150),
    supabase.from('apollo_incoming_shipments')
      .select('id,shipment_ref,method,supplier,eta,original_eta,status,landed_date,notes,created_at,updated_at')
      .order('eta', { ascending: true }).limit(100),
    supabase.from('apollo_incoming_shipment_lines')
      .select('id,shipment_id,sku,description,quantity,created_at').order('created_at', { ascending: true }).limit(600),
    supabase.from('apollo_incoming_receipts')
      .select('id,shipment_id,receipt_ref,received_date,sku,quantity,notes,created_at').order('received_date', { ascending: false }).limit(600),
  ]);
  for (const result of [rules, shipments, lines, receipts]) if (result.error) throw result.error;
  const linesByShipment = new Map();
  for (const line of lines.data || []) {
    const existing = linesByShipment.get(line.shipment_id) || [];
    existing.push(line);
    linesByShipment.set(line.shipment_id, existing);
  }
  const receiptsByShipment = new Map();
  for (const receipt of receipts.data || []) {
    const existing = receiptsByShipment.get(receipt.shipment_id) || [];
    existing.push(receipt);
    receiptsByShipment.set(receipt.shipment_id, existing);
  }
  return {
    rules: rules.data || [],
    shipments: (shipments.data || []).map((shipment) => ({
      ...shipment,
      lines: linesByShipment.get(shipment.id) || [],
      receipts: receiptsByShipment.get(shipment.id) || [],
    })),
  };
}

function normalizeLines(value) {
  const lines = Array.isArray(value) ? value : [];
  const deduped = new Map();
  for (const entry of lines) {
    const code = sku(entry?.sku);
    const quantity = numeric(entry?.quantity, { minimum: 0.000001, nullable: false });
    if (!code) throw new Error('Each incoming line needs a SKU');
    if (deduped.has(code)) throw new Error(`SKU ${code} appears more than once in this shipment`);
    deduped.set(code, { sku: code, description: text(entry?.description), quantity });
  }
  if (!deduped.size) throw new Error('Add at least one incoming SKU line');
  return [...deduped.values()];
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  const supabase = getPortalAdminClient();

  try {
    if (req.method === 'GET') return res.status(200).json(await loadLedger(supabase));
    if (req.method !== 'POST' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const action = text(body.action);
    const createdBy = await actor(req);

    if (req.method === 'POST' && action === 'upsert_rule') {
      const row = {
        supplier: text(body.supplier), sku: sku(body.sku),
        lead_time_days: numeric(body.leadTimeDays, { minimum: 0 }),
        moq: numeric(body.moq, { minimum: 0 }), pack_size: numeric(body.packSize, { minimum: 0.000001 }),
        target_cover_months: numeric(body.targetCoverMonths, { minimum: 0.5, nullable: false }),
        notes: text(body.notes), created_by: createdBy, updated_at: new Date().toISOString(),
      };
      if (!row.sku) throw new Error('SKU is required');
      if (row.target_cover_months > 24) throw new Error('Target cover must be between 0.5 and 24 months');
      const { error } = await supabase.from('apollo_supplier_sku_settings')
        .upsert(row, { onConflict: 'supplier,sku' });
      if (error) throw error;
      return res.status(200).json(await loadLedger(supabase));
    }

    if (req.method === 'POST' && action === 'create_shipment') {
      const shipment = {
        shipment_ref: text(body.shipmentRef), method: text(body.method), supplier: text(body.supplier),
        eta: date(body.eta, 'ETA'), original_eta: text(body.originalEta) || null,
        status: text(body.status) || 'Ordered', landed_date: text(body.landedDate) || null,
        notes: text(body.notes), source_file: 'admin', created_by: createdBy,
      };
      if (!shipment.shipment_ref) throw new Error('Shipment reference is required');
      if (!SHIPMENT_METHODS.has(shipment.method)) throw new Error('Method must be Container or Air');
      if (!SHIPMENT_STATUSES.has(shipment.status)) throw new Error('Choose a valid shipment status');
      if (shipment.status === 'Landed â awaiting GRV' && !shipment.landed_date) throw new Error('Landed date is required for landed stock');
      const lines = normalizeLines(body.lines);
      const { data, error } = await supabase.from('apollo_incoming_shipments').insert(shipment).select('id').single();
      if (error) throw error;
      const { error: lineError } = await supabase.from('apollo_incoming_shipment_lines')
        .insert(lines.map((line) => ({ ...line, shipment_id: data.id })));
      if (lineError) throw lineError;
      return res.status(201).json(await loadLedger(supabase));
    }

    if (req.method === 'POST' && action === 'record_receipt') {
      const receipt = {
        shipment_id: text(body.shipmentId), receipt_ref: text(body.receiptRef), received_date: date(body.receivedDate, 'Received date'),
        sku: sku(body.sku), quantity: numeric(body.quantity, { minimum: 0.000001, nullable: false }),
        notes: text(body.notes), created_by: createdBy,
      };
      if (!receipt.shipment_id || !receipt.receipt_ref || !receipt.sku) throw new Error('Shipment, GRV reference and SKU are required');
      const { error } = await supabase.from('apollo_incoming_receipts').insert(receipt);
      if (error) throw error;
      return res.status(201).json(await loadLedger(supabase));
    }

    if (req.method === 'PATCH' && action === 'update_shipment_status') {
      const id = text(body.shipmentId);
      const status = text(body.status);
      if (!id || !SHIPMENT_STATUSES.has(status)) throw new Error('Choose a valid shipment status');
      const patch = { status, updated_at: new Date().toISOString() };
      if (body.eta !== undefined) patch.eta = date(body.eta, 'ETA');
      if (body.landedDate !== undefined) patch.landed_date = text(body.landedDate) || null;
      if (status === 'Landed â awaiting GRV' && !patch.landed_date) throw new Error('Landed date is required for landed stock');
      const { error } = await supabase.from('apollo_incoming_shipments').update(patch).eq('id', id);
      if (error) throw error;
      return res.status(200).json(await loadLedger(supabase));
    }

    return res.status(400).json({ error: 'Unknown buying ledger action' });
  } catch (error) {
    return actionError(res, error);
  }
}
