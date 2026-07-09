import { contextEnvelope } from './_helpers.js';

const NOT_AVAILABLE = [
  'erp_lines',
  'arrival_date',
  'supplier',
  'products',
  'cost',
  'status',
  'memory_decisions',
];

export async function buildContainerContext(params = {}, ctx = {}) {
  const reference = String(params.reference || '').trim();
  const number = String(params.number || '').trim();

  if (!reference && !number) {
    return contextEnvelope('container', emptyContainerShape(''), {}, 'container.context');
  }

  const label = reference || `Container ${number}`;

  return contextEnvelope('container', {
    reference: label,
    number: number || null,
    shipment: {
      arrivalDate: null,
      supplier: null,
      status: null,
      productCount: null,
    },
    lines: [],
    memory: { decisions: [], lessons: [] },
    status: { code: 'stub', label: 'Container intelligence (stub)' },
    notAvailable: [...NOT_AVAILABLE],
    stub: true,
  }, { source: ['apollo_entity_registry'], partial: true, warnings: ['CONTAINER_CONTEXT_STUB'] }, 'container.context');
}

function emptyContainerShape(reference) {
  return {
    reference,
    number: null,
    shipment: null,
    lines: [],
    memory: null,
    status: { code: 'not_found', label: 'No container reference provided' },
    notAvailable: [...NOT_AVAILABLE],
    stub: true,
  };
}
