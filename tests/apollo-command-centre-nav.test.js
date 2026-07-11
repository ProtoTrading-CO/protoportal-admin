import { describe, it, expect } from 'vitest';
import {
  APOLLO_COMMAND_DEFAULT_MODE,
  APOLLO_COMMAND_MODES,
  APOLLO_WORK_OBJECTS,
  isWorkObjectReady,
  workObjectById,
} from '../src/lib/apolloCommandCentre.js';

describe('apolloCommandCentre modes', () => {
  it('exposes Today, Work, and Knowledge as top-level modes', () => {
    expect(APOLLO_COMMAND_DEFAULT_MODE).toBe('today');
    expect(APOLLO_COMMAND_MODES.map((n) => n.id)).toEqual(['today', 'work', 'knowledge']);
    expect(APOLLO_COMMAND_MODES.map((n) => n.label)).toEqual(['Today', 'Work', 'Knowledge']);
    expect(APOLLO_COMMAND_MODES.find((n) => n.id === 'knowledge')?.tagline).toBe('What do we know?');
  });

  it('registers operational objects behind Work', () => {
    expect(APOLLO_WORK_OBJECTS.map((w) => w.id)).toEqual([
      'orders',
      'customers',
      'suppliers',
      'containers',
      'buying',
    ]);
    expect(isWorkObjectReady('orders')).toBe(true);
    expect(isWorkObjectReady('customers')).toBe(false);
    expect(workObjectById('orders')?.statusLabel).toBe('Ready');
    expect(workObjectById('customers')?.statusLabel).toBe('Planning');
    expect(workObjectById('suppliers')?.modules).toContain('Purchase Orders');
  });
});
