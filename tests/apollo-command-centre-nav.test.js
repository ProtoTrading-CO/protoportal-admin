import { describe, it, expect } from 'vitest';
import { APOLLO_COMMAND_NAV, APOLLO_COMMAND_DEFAULT_NAV } from '../src/lib/apolloCommandCentre.js';

describe('apolloCommandCentre nav', () => {
  it('exposes only Today, Orders, and Remember', () => {
    expect(APOLLO_COMMAND_DEFAULT_NAV).toBe('today');
    expect(APOLLO_COMMAND_NAV.map((n) => n.id)).toEqual(['today', 'orders', 'remember']);
  });
});
