/** Enforce param schema and row limits before adapter execution. */

function assertParamType(name, value, schema) {
  if (value == null || value === '') return;
  const t = schema?.type || 'string';
  if (t === 'string' && typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Param "${name}" must be a string`);
  }
  if (t === 'number' && typeof value !== 'number') {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`Param "${name}" must be a number`);
  }
  if (t === 'boolean' && typeof value !== 'boolean') {
    throw new Error(`Param "${name}" must be a boolean`);
  }
}

export function validateParams(def, params = {}) {
  const schema = def.params || {};
  const input = params && typeof params === 'object' ? params : {};

  for (const [name, rule] of Object.entries(schema)) {
    const value = input[name];
    if (rule?.required && (value == null || value === '')) {
      const err = new Error(`Missing required param: ${name}`);
      err.code = 'INVALID_PARAMS';
      throw err;
    }
    assertParamType(name, value, rule);
  }

  const capped = { ...input };
  if (schema.limit && capped.limit != null) {
    const max = def.maxRows ?? schema.limit.max ?? 500;
    capped.limit = Math.min(Math.max(1, Number(capped.limit) || 1), max);
  }

  return capped;
}

export function enforceMaxRows(def, rows) {
  if (!Array.isArray(rows)) return rows;
  const max = def.maxRows;
  if (!max || rows.length <= max) return rows;
  return rows.slice(0, max);
}
