import { describe, it, expect } from 'vitest';
import { validateParams } from '../../api/intelligence/query-engine/read-guard.js';

describe('read-guard', () => {
  const def = {
    id: 'portal.customer_by_id',
    params: { id: { type: 'string', required: true } },
    maxRows: 1,
  };

  it('requires mandatory params', () => {
    expect(() => validateParams(def, {})).toThrow(/Missing required param/);
  });

  it('passes valid params', () => {
    const params = validateParams(def, { id: 'abc-123' });
    expect(params.id).toBe('abc-123');
  });

  it('caps limit to maxRows', () => {
    const limitDef = {
      params: { limit: { type: 'number' } },
      maxRows: 50,
    };
    const params = validateParams(limitDef, { limit: 999 });
    expect(params.limit).toBe(50);
  });
});
