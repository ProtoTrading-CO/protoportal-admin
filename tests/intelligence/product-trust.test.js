import { describe, it, expect } from 'vitest';
import { trustField, readTrust, CONFIDENCE } from '../../api/intelligence/bi/shared/trust.js';
import { formatProductContext } from '../../api/intelligence/bi/format/product.js';

describe('trustField', () => {
  it('exposes value, source, timestamp, confidence', () => {
    const f = trustField('PLAYING CARDS', {
      source: 'erp_sql',
      confidence: CONFIDENCE.erp_sql,
      timestamp: '2026-07-09T10:00:00.000Z',
    });
    expect(f.value).toBe('PLAYING CARDS');
    expect(f.source).toBe('erp_sql');
    expect(f.timestamp).toBe('2026-07-09T10:00:00.000Z');
    expect(f.confidence).toBe(0.98);
  });

  it('readTrust returns value from envelope', () => {
    expect(readTrust({ value: 67, source: 'erp_sql' })).toBe(67);
    expect(readTrust('plain')).toBe('plain');
  });
});

describe('formatProductContext evidence', () => {
  it('renders evidence section for live ERP', () => {
    const md = formatProductContext({
      data: {
        type: 'product',
        code: '8626100145',
        liveErp: true,
        erpDataSource: 'erp_sql',
        erp: { title: 'PLAYING CARDS', onhand: 67, booked: 0, available: 67, price: 12.61, dept: 'ART' },
        website: null,
        stock: { onHand: 67, source: 'erp_sql' },
        supplier: { name: 'YIWU', department: 'ART' },
        status: { code: 'erp_only', label: 'In ERP — not on website' },
        evidence: {
          title: { value: 'PLAYING CARDS', source: 'erp_sql', timestamp: '2026-07-09T10:00:00.000Z', confidence: 0.98 },
          onHand: { value: 67, source: 'erp_sql', timestamp: '2026-07-09T10:00:00.000Z', confidence: 0.98 },
          supplier: { value: 'YIWU', source: 'stmast_cache', timestamp: '2026-07-09T10:00:00.000Z', confidence: 0.72 },
        },
        notAvailable: ['margin'],
      },
      meta: { source: ['erp_sql'], generatedAt: '2026-07-09T10:00:00.000Z', warnings: [] },
    });
    expect(md).toContain('live BLADERUNNER');
    expect(md).toContain('### Evidence');
    expect(md).toContain('erp sql');
    expect(md).toContain('98%');
  });
});
