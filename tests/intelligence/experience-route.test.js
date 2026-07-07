import { describe, it, expect } from 'vitest';
import { detectExperienceRoute } from '../../api/apollo-experience.js';

describe('apollo-experience routing', () => {
  it('routes morning brief phrases', () => {
    expect(detectExperienceRoute('Morning brief')?.intent).toBe('brief.morning');
    expect(detectExperienceRoute('What changed yesterday?')?.intent).toBe('brief.morning');
  });

  it('routes product code lookups', () => {
    const route = detectExperienceRoute('Show product 8610100001');
    expect(route?.intent).toBe('product.context');
    expect(route?.params.code).toBe('8610100001');
  });

  it('routes customer lookups', () => {
    const route = detectExperienceRoute('Find customer Plushprops');
    expect(route?.intent).toBe('customer.context');
    expect(route?.params.q).toBe('Plushprops');
  });

  it('routes inventory attention', () => {
    expect(detectExperienceRoute('negative stock')?.params.type).toBe('negative');
    expect(detectExperienceRoute('zero stock')?.params.type).toBe('zero');
  });

  it('returns null for unrelated queries', () => {
    expect(detectExperienceRoute('orders this week')).toBeNull();
  });
});
