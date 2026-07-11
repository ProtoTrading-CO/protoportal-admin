import { describe, expect, it } from 'vitest';
import {
  buildApolloInboxItems,
  buildRecentConversationSnippets,
} from '../src/lib/apolloInboxPresentation.js';

describe('apolloInboxPresentation', () => {
  it('builds compact inbox rows with who why when only', () => {
    const items = buildApolloInboxItems({
      notifications: {
        items: [
          {
            id: '1',
            category: 'orders_overdue',
            title: 'Christa order is overdue',
            detected_at: new Date(Date.now() - 120_000).toISOString(),
          },
          {
            id: '2',
            category: 'supplier_followups',
            title: 'Supplier follow-up: Motarro',
            detail: 'Stock not received',
            detected_at: new Date(Date.now() - 1_080_000).toISOString(),
          },
        ],
      },
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      who: 'Christa',
      why: 'Order approval waiting',
      workType: { emoji: '📦', label: 'ORDER' },
    });
    expect(items[1]).toMatchObject({
      who: 'Motarro',
      workType: { emoji: '🚚', label: 'SUPPLIER' },
    });
    expect(items[1].when).toBeTruthy();
  });

  it('builds recent conversation snippets from chat messages', () => {
    const rows = buildRecentConversationSnippets([
      { role: 'user', content: 'Show product 8610100001' },
      { role: 'assistant', content: 'Here is the product.' },
      { role: 'user', content: 'Which products have negative stock?' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].label).toMatch(/negative stock/i);
  });
});
