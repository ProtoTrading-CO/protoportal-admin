/** Approved read-only SQL report catalogue metadata. No SQL text is exposed. */

export const SQL_REPORT_SOURCE = 'POSWINSQL';

export const SQL_REPORT_CATALOGUE = {
  'inventory.product_lookup': {
    title: 'Product lookup',
    description: 'Read-only STMAST row for one Proto SKU.',
    category: 'inventory',
    maxRows: 1,
    parameters: {
      sku: { type: 'string', required: true, description: 'Proto SKU / item code' },
    },
  },
  'inventory.stock_by_department': {
    title: 'Stock by department',
    description: 'STMAST stock rows for a department, optionally negative available only.',
    category: 'inventory',
    maxRows: 500,
    parameters: {
      department: { type: 'string', required: true, description: 'STMAST DEPT value' },
      negativeOnly: { type: 'boolean', required: false, default: false },
      limit: { type: 'integer', required: false, default: 100, max: 500 },
    },
  },
  'sales.top_products': {
    title: 'Top products',
    description: 'Top-selling SKUs between two dates from Positill invoice lines.',
    category: 'sales',
    maxRows: 100,
    parameters: {
      startDate: { type: 'date', required: true, description: 'Inclusive start date (YYYY-MM-DD, SAST)' },
      endDate: { type: 'date', required: true, description: 'Inclusive end date (YYYY-MM-DD, SAST)' },
      sortBy: { type: 'enum', required: false, default: 'revenue', enum: ['revenue', 'units'] },
      limit: { type: 'integer', required: false, default: 25, max: 100 },
    },
  },
  'sales.product_monthly': {
    title: 'Product monthly sales',
    description: 'Monthly unit sales and value for one SKU.',
    category: 'sales',
    maxRows: 36,
    parameters: {
      sku: { type: 'string', required: true, description: 'Proto SKU / item code' },
      months: { type: 'integer', required: false, default: 12, max: 36 },
    },
  },
  'sales.invoice_lines': {
    title: 'Invoice lines',
    description: 'Positill invoice detail lines for a SKU over a date window.',
    category: 'sales',
    maxRows: 500,
    parameters: {
      sku: { type: 'string', required: true, description: 'Proto SKU / item code' },
      days: { type: 'integer', required: false, default: 30, max: 366 },
      limit: { type: 'integer', required: false, default: 200, max: 500 },
    },
  },
};

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function listSqlReports() {
  return Object.entries(SQL_REPORT_CATALOGUE).map(([id, spec]) => ({
    id,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    maxRows: spec.maxRows,
    parameters: spec.parameters,
  }));
}

export function getSqlReportDefinition(reportId) {
  return SQL_REPORT_CATALOGUE[reportId] || null;
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(text)) return false;
  const err = new Error(`Invalid boolean value: ${value}`);
  err.code = 'INVALID_PARAMS';
  throw err;
}

function parseIntParam(name, value, fallback, maximum) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    const err = new Error(`Param "${name}" must be a positive integer`);
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return Math.min(Math.trunc(parsed), maximum);
}

function normalizeSku(value, name = 'sku') {
  const sku = String(value || '').trim().toUpperCase();
  if (!sku || !SKU_RE.test(sku)) {
    const err = new Error(`Param "${name}" must be a valid SKU code`);
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return sku;
}

function parseDate(name, value) {
  const text = String(value || '').trim();
  if (!ISO_DATE_RE.test(text)) {
    const err = new Error(`Param "${name}" must be YYYY-MM-DD`);
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return text;
}

export function validateSqlReportParams(reportId, rawParams = {}) {
  const spec = getSqlReportDefinition(reportId);
  if (!spec) {
    const err = new Error(`Unapproved report: ${reportId}`);
    err.code = 'UNAPPROVED_REPORT';
    throw err;
  }

  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    const err = new Error('params must be an object');
    err.code = 'INVALID_PARAMS';
    throw err;
  }

  const schema = spec.parameters;
  const unknown = Object.keys(rawParams).filter((key) => !(key in schema));
  if (unknown.length) {
    const err = new Error(`Unknown parameters: ${unknown.join(', ')}`);
    err.code = 'INVALID_PARAMS';
    throw err;
  }

  const normalized = {};
  for (const [name, rule] of Object.entries(schema)) {
    let value = rawParams[name];
    if ((value == null || value === '') && Object.prototype.hasOwnProperty.call(rawParams, name)) {
      value = rawParams[name];
    }
    if ((value == null || value === '') && rule.default != null) value = rule.default;
    if (rule.required && (value == null || value === '')) {
      const err = new Error(`Missing required parameter: ${name}`);
      err.code = 'INVALID_PARAMS';
      throw err;
    }
    if (value == null || value === '') continue;

    switch (rule.type) {
      case 'string':
        normalized[name] = String(value).trim();
        break;
      case 'boolean':
        normalized[name] = parseBool(value);
        break;
      case 'integer':
        normalized[name] = parseIntParam(name, value, rule.default ?? 1, rule.max ?? spec.maxRows);
        break;
      case 'date':
        normalized[name] = parseDate(name, value);
        break;
      case 'enum': {
        const text = String(value).trim().toLowerCase();
        if (!rule.enum.map((item) => String(item).toLowerCase()).includes(text)) {
          const err = new Error(`Param "${name}" must be one of: ${rule.enum.join(', ')}`);
          err.code = 'INVALID_PARAMS';
          throw err;
        }
        normalized[name] = text;
        break;
      }
      default:
        normalized[name] = value;
    }
  }

  if (reportId === 'inventory.product_lookup') {
    normalized.sku = normalizeSku(normalized.sku);
  }
  if (reportId === 'inventory.stock_by_department') {
    const dept = String(normalized.department || '').trim();
    if (!dept || dept.length > 64) {
      const err = new Error('Param "department" must be 1-64 characters');
      err.code = 'INVALID_PARAMS';
      throw err;
    }
    normalized.department = dept;
    normalized.negativeOnly = normalized.negativeOnly ?? false;
    normalized.limit = parseIntParam('limit', normalized.limit, schema.limit.default, schema.limit.max);
  }
  if (reportId === 'sales.top_products') {
    if (normalized.endDate < normalized.startDate) {
      const err = new Error('endDate must be on or after startDate');
      err.code = 'INVALID_PARAMS';
      throw err;
    }
    normalized.sortBy = normalized.sortBy || 'revenue';
    normalized.limit = parseIntParam('limit', normalized.limit, schema.limit.default, schema.limit.max);
  }
  if (reportId === 'sales.product_monthly') {
    normalized.sku = normalizeSku(normalized.sku);
    normalized.months = parseIntParam('months', normalized.months, schema.months.default, schema.months.max);
  }
  if (reportId === 'sales.invoice_lines') {
    normalized.sku = normalizeSku(normalized.sku);
    normalized.days = parseIntParam('days', normalized.days, schema.days.default, schema.days.max);
    normalized.limit = parseIntParam('limit', normalized.limit, schema.limit.default, schema.limit.max);
  }

  return normalized;
}

export function isSqlReportsConfigured() {
  return Boolean(String(process.env.STOCK_SQL_BRIDGE_URL || '').trim());
}

function bridgeHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = String(process.env.STOCK_SQL_BRIDGE_KEY || '').trim();
  if (key) headers['x-api-key'] = key;
  return headers;
}

export async function fetchSqlReportsCatalogue() {
  const base = String(process.env.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    const err = new Error('SQL reporting bridge is not configured (STOCK_SQL_BRIDGE_URL)');
    err.code = 'BRIDGE_UNAVAILABLE';
    throw err;
  }

  const res = await fetch(`${base}/reports`, {
    method: 'GET',
    headers: bridgeHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `SQL bridge failed (${res.status})`);
  }
  return json.reports || listSqlReports();
}

export async function runSqlReport(reportId, rawParams = {}) {
  const params = validateSqlReportParams(reportId, rawParams);
  const base = String(process.env.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  if (!base) {
    const err = new Error('SQL reporting bridge is not configured (STOCK_SQL_BRIDGE_URL)');
    err.code = 'BRIDGE_UNAVAILABLE';
    throw err;
  }

  const res = await fetch(`${base}/reports/run`, {
    method: 'POST',
    headers: bridgeHeaders(),
    body: JSON.stringify({ reportId, params }),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `SQL report failed (${res.status})`);
    err.code = res.status === 400 ? 'INVALID_PARAMS' : 'REPORT_FAILED';
    throw err;
  }

  return {
    reportId: json.reportId || reportId,
    parameters: json.parameters || params,
    rows: Array.isArray(json.rows) ? json.rows : [],
    rowCount: Number(json.rowCount) || (Array.isArray(json.rows) ? json.rows.length : 0),
    source: json.source || SQL_REPORT_SOURCE,
    generatedAt: json.generatedAt || new Date().toISOString(),
    readOnly: json.readOnly !== false,
    meta: {
      readOnly: json.meta?.readOnly !== false,
      truncated: Boolean(json.meta?.truncated),
      maxRows: Number(json.meta?.maxRows) || getSqlReportDefinition(reportId)?.maxRows || null,
      returnedRows: Number(json.meta?.returnedRows) || Number(json.rowCount) || 0,
    },
  };
}
