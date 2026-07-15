import { describe, expect, it } from 'vitest';
import {
  buildBuyingHistory,
  normalizeBuyingMonths,
  normalizeBuyingSkus,
} from '../../api/_sql-buying.js';

describe('Proto buying SQL provider', () => {
  it('normalizes and deduplicates SKUs without coercing identifiers', () => {
    expect(normalizeBuyingSkus([' 001-a ', '001-A', 'MP133-1'])).toEqual(['001-A', 'MP133-1']);
  });

  it('rejects empty or oversized requests', () => {
    expect(() => normalizeBuyingSkus([])).toThrow(/at least one SKU/i);
    expect(() => normalizeBuyingSkus(Array.from({ length: 501 }, (_, i) => `SKU-${i}`))).toThrow(/maximum of 500/i);
  });

  it('bounds the sales-history period', () => {
    expect(normalizeBuyingMonths(0)).toBe(1);
    expect(normalizeBuyingMonths(24)).toBe(24);
    expect(normalizeBuyingMonths(100)).toBe(36);
  });

  it('builds stock and rolling unit sales without inventing missing products', () => {
    const result = buildBuyingHistory({
      skus: ['001-A', 'MISSING'],
      months: 12,
      now: new Date('2026-07-14T08:00:00.000Z'),
      productRows: [{
        CODE: '001-A', DESCR: 'TEST ITEM', PRICE_A: 12.5, ONHAND: 20, BOOKED: 3, DEPT: '07',
      }],
      salesRows: [
        { code: '001-A', salesMonth: '2026-07', units: 5, salesValue: 62.5, invoiceCount: 2 },
        { code: '001-A', salesMonth: '2026-06', units: 8, salesValue: 100, invoiceCount: 3 },
        { code: '001-A', salesMonth: '2026-05', units: 7, salesValue: 87.5, invoiceCount: 2 },
      ],
    });

    expect(result.items[0]).toMatchObject({
      code: '001-A', found: true, onHand: 20, booked: 3, available: 17,
      sales: { units3m: 20, activeMonths: 3, invoiceCount: 7 },
    });
    expect(result.items[0].sales.units24m).toBeNull();
    expect(result.items[1]).toMatchObject({
      code: 'MISSING', found: false, onHand: null, booked: null, available: null,
    });
    expect(result.meta).toMatchObject({
      readOnly: true, requestedSkuCount: 2, foundSkuCount: 1, missingSkuCount: 1,
    });
  });
});
