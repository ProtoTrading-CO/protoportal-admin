import { readApiJson } from './apiError';

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return readApiJson(res, { fallback: 'Buying workspace request failed' });
}

export function getBuyingLedger() {
  return request('/api/apollo-buying-ledger');
}

export function saveSupplierRule(payload) {
  return request('/api/apollo-buying-ledger', { method: 'POST', body: JSON.stringify({ action: 'upsert_rule', ...payload }) });
}

export function createIncomingShipment(payload) {
  return request('/api/apollo-buying-ledger', { method: 'POST', body: JSON.stringify({ action: 'create_shipment', ...payload }) });
}

export function recordIncomingReceipt(payload) {
  return request('/api/apollo-buying-ledger', { method: 'POST', body: JSON.stringify({ action: 'record_receipt', ...payload }) });
}

export function updateIncomingShipmentStatus(payload) {
  return request('/api/apollo-buying-ledger', { method: 'PATCH', body: JSON.stringify({ action: 'update_shipment_status', ...payload }) });
}
