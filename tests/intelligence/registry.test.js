import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerQuery,
  getQuery,
  listQueries,
  clearRegistry,
} from '../../api/intelligence/query-engine/registry.js';

describe('registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves a query by id', () => {
    registerQuery({
      id: 'test.hello',
      adapter: 'sql',
      params: {},
      maxRows: 1,
      async run() {
        return { data: { hello: true }, source: ['test'] };
      },
    });
    const def = getQuery('test.hello');
    expect(def.id).toBe('test.hello');
    expect(listQueries()).toContain('test.hello');
  });

  it('throws for unknown queryId', () => {
    expect(() => getQuery('missing.query')).toThrow(/Unknown query/);
    try {
      getQuery('missing.query');
    } catch (err) {
      expect(err.code).toBe('UNKNOWN_QUERY');
    }
  });

  it('rejects duplicate registration', () => {
    const def = { id: 'dup.test', adapter: 'sql', params: {}, async run() {} };
    registerQuery(def);
    expect(() => registerQuery(def)).toThrow(/already registered/);
  });
});
