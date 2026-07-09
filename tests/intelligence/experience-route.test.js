import { describe, it, expect } from 'vitest';
import { detectExperienceRoute } from '../../api/apollo-experience.js';

describe('apollo-experience routing (intent engine)', () => {
  it('routes morning brief phrases to daily_brief', () => {
    const route = detectExperienceRoute('What needs my attention today?');
    expect(route?.intent).toBe('brief.morning');
    expect(route?.businessIntent).toBe('daily_brief');
  });

  it('routes yesterday to yesterday_summary', () => {
    const route = detectExperienceRoute('What changed yesterday?');
    expect(route?.intent).toBe('brief.morning');
    expect(route?.businessIntent).toBe('yesterday_summary');
    expect(route?.formatSection).toBe('yesterday');
  });

  it('routes product code lookups', () => {
    const route = detectExperienceRoute('Show product 8610100001');
    expect(route?.intent).toBe('product.context');
    expect(route?.businessIntent).toBe('product_lookup');
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

  it('returns clarify for ambiguous terms', () => {
    const route = detectExperienceRoute('Leather');
    expect(route?.clarify).toBeTruthy();
    expect(route?.reply).toMatch(/Leather/i);
  });

  it('routes Motarro to supplier context', () => {
    const route = detectExperienceRoute('Motarro');
    expect(route?.intent).toBe('supplier.context');
    expect(route?.entityType).toBe('supplier');
    expect(route?.params.name).toBe('Motarro');
  });

  it('routes Container 57 to container context', () => {
    const route = detectExperienceRoute('Container 57');
    expect(route?.intent).toBe('container.context');
    expect(route?.params.number).toBe('57');
  });

  it('returns null for unrelated queries', () => {
    expect(detectExperienceRoute('orders this week')).toBeNull();
  });
});
