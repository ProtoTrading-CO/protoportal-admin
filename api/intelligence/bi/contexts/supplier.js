import { contextEnvelope } from './_helpers.js';

const NOT_AVAILABLE = [
  'lead_times',
  'delays',
  'quality',
  'margins',
  'substitutes',
  'communication',
  'reliability',
  'erp_products',
  'memory_lessons',
  'memory_decisions',
];

export async function buildSupplierContext(params = {}, ctx = {}) {
  const name = String(params.name || params.q || '').trim();
  if (!name) {
    return contextEnvelope('supplier', emptySupplierShape(''), {}, 'supplier.context');
  }

  return contextEnvelope('supplier', {
    name,
    intelligence: {
      leadTimes: null,
      delays: null,
      quality: null,
      margins: null,
      substitutes: null,
      communication: null,
      reliability: null,
    },
    erp: null,
    memory: {
      lessons: [],
      decisions: [],
      hypotheses: [],
    },
    status: { code: 'stub', label: 'Supplier intelligence (Capability 4 — stub)' },
    notAvailable: [...NOT_AVAILABLE],
    stub: true,
  }, { source: ['apollo_entity_registry'], partial: true, warnings: ['SUPPLIER_CONTEXT_STUB'] }, 'supplier.context');
}

function emptySupplierShape(name) {
  return {
    name,
    intelligence: null,
    erp: null,
    memory: null,
    status: { code: 'not_found', label: 'No supplier name provided' },
    notAvailable: [...NOT_AVAILABLE],
    stub: true,
  };
}
