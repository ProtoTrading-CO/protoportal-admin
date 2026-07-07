import { describe, it, expect, beforeEach } from 'vitest';
import { ok, fail, withMeta, WARNING_CODES } from '../../api/intelligence/query-engine/envelope.js';

describe('envelope', () => {
  it('ok() returns standard shape', () => {
    const result = ok({ customer: { id: '1' } }, { source: ['portal_supabase'] }, 'customer.profile');
    expect(result.ok).toBe(true);
    expect(result.intent).toBe('customer.profile');
    expect(result.data).toEqual({ customer: { id: '1' } });
    expect(result.error).toBeNull();
    expect(result.meta.source).toEqual(['portal_supabase']);
    expect(result.meta.partial).toBe(false);
    expect(result.meta.cache).toBe('bypass');
    expect(result.meta.warnings).toEqual([]);
    expect(result.meta.generatedAt).toBeTruthy();
  });

  it('fail() normalizes string errors', () => {
    const result = fail('Something broke');
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: 'QUERY_FAILED', message: 'Something broke' });
  });

  it('withMeta() merges meta fields', () => {
    const base = ok({ x: 1 });
    const merged = withMeta(base, { cache: 'hit', warnings: [WARNING_CODES.PARTIAL_DATA] });
    expect(merged.meta.cache).toBe('hit');
    expect(merged.meta.warnings).toEqual([WARNING_CODES.PARTIAL_DATA]);
    expect(merged.data).toEqual({ x: 1 });
  });
});
