import { searchIndex } from './apollo-data.js';

function chartBlock(title, labels, values) {
  return `\n\`\`\`chart\n${JSON.stringify({ type: 'bar', title, labels: labels.slice(0, 10), values: values.slice(0, 10) })}\n\`\`\``;
}

function money(n) {
  return `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function executeIntent(intent, data, terms = '') {
  const { customers, orders, products, search } = data;

  switch (intent) {
    case 'product_negative_stock': {
      const rows = products.all
        .filter((p) => p.stockOnHand != null && p.stockOnHand < 0)
        .sort((a, b) => a.stockOnHand - b.stockOnHand)
        .slice(0, 15);
      if (!rows.length) {
        return {
          source: 'live-index',
          intent,
          reply: '## Negative stock\n\nNo products currently show a stock level below zero.',
        };
      }
      const lines = rows.map((p, i) => `${i + 1}. **${p.title}** (${p.sku}) — **${p.stockOnHand}** units · ${p.category}`);
      return {
        source: 'live-index',
        intent,
        reply: `## Negative stock (${rows.length})\n\n${lines.join('\n')}${chartBlock('Negative stock levels', rows.slice(0, 10).map((p) => p.sku.slice(0, 12)), rows.slice(0, 10).map((p) => p.stockOnHand))}`,
      };
    }

    case 'product_count':
      return {
        source: 'live-index',
        intent,
        reply: `## Product catalogue\n\n- **Live products:** ${products.liveCount}\n- **Archived:** ${products.archivedCount ?? '—'}\n- **Zero stock:** ${products.zeroStockCount}\n- **Categories:** ${products.byCategory.length}${products.error ? `\n\n_Stock detail note: ${products.error}_` : ''}`,
      };

    case 'product_low_stock': {
      const rows = products.lowestStock.slice(0, 10);
      if (!rows.length) {
        return {
          source: 'live-index',
          intent,
          reply: products.liveCount
            ? `## Lowest stock\n\nStock levels are not linked for all SKUs yet. You have **${products.liveCount}** live products in the catalogue.`
            : 'No product stock data available.',
        };
      }
      const lines = rows.map((p, i) => `${i + 1}. **${p.title}** (${p.sku}) — **${p.stockOnHand}** units · ${p.category}`);
      return {
        source: 'live-index',
        intent,
        reply: `## Lowest stock (top 10)\n\n${lines.join('\n')}${chartBlock('Lowest stock', rows.map((p) => p.sku.slice(0, 12)), rows.map((p) => p.stockOnHand))}`,
      };
    }

    case 'product_high_stock': {
      const rows = products.highestStock.slice(0, 10);
      if (!rows.length) return { source: 'live-index', intent, reply: 'No stock data available.' };
      const lines = rows.map((p, i) => `${i + 1}. **${p.title}** (${p.sku}) — ${p.stockOnHand} units`);
      return {
        source: 'live-index',
        intent,
        reply: `## Highest stock\n\n${lines.join('\n')}${chartBlock('Highest stock', rows.map((p) => p.sku.slice(0, 12)), rows.map((p) => p.stockOnHand))}`,
      };
    }

    case 'product_by_category': {
      const cats = products.byCategory.slice(0, 10);
      if (!cats.length) return { source: 'live-index', intent, reply: 'No category data available.' };
      return {
        source: 'live-index',
        intent,
        reply: `## Products by category\n\n${cats.map((c) => `- **${c.category}:** ${c.count}`).join('\n')}${chartBlock('By category', cats.map((c) => c.category.slice(0, 14)), cats.map((c) => c.count))}`,
      };
    }

    case 'product_search': {
      const hits = searchIndex(data.index, terms, { domain: 'product', limit: 10 });
      if (!hits.length) {
        return { source: 'live-index', intent, reply: `No products matched **"${terms}"**. Try a SKU or title keyword.` };
      }
      return {
        source: 'live-index',
        intent,
        reply: `## Product search\n\n${hits.map((h, i) => {
          const p = h.payload;
          const stock = p.stockOnHand != null ? `${p.stockOnHand} in stock` : 'stock n/a';
          return `${i + 1}. **${p.title}** · ${p.sku} · ${stock}`;
        }).join('\n')}`,
      };
    }

    case 'customer_list':
      return {
        source: 'live-index',
        intent,
        reply: `## Your customers (${customers.total})\n\n${customers.list.map((c) => {
          const label = c.business ? `**${c.name}** (${c.business})` : `**${c.name}**`;
          return `- ${label} — ${c.email} · ${c.approved ? 'approved' : 'pending'} · ${c.orderCount} orders`;
        }).join('\n') || 'No customers yet.'}`,
      };

    case 'customer_pending': {
      const pending = customers.list.filter((c) => !c.approved);
      return {
        source: 'live-index',
        intent,
        reply: `## Pending approval (${pending.length})\n\n${pending.map((c) => `- **${c.name}** — ${c.email}`).join('\n') || 'None waiting.'}`,
      };
    }

    case 'customer_search': {
      const hits = searchIndex(data.index, terms, { domain: 'customer', limit: 10 });
      if (!hits.length) return { source: 'live-index', intent, reply: `No customers matched "${terms}".` };
      return {
        source: 'live-index',
        intent,
        reply: `## Customer search\n\n${hits.map((h) => {
          const c = h.payload;
          return `- **${c.name}** — ${c.email}${c.business ? ` · ${c.business}` : ''}`;
        }).join('\n')}`,
      };
    }

    case 'order_top_items': {
      const top = orders.topLineItems.slice(0, 10);
      if (!top.length) return { source: 'live-index', intent, reply: 'No order line items recorded yet.' };
      return {
        source: 'live-index',
        intent,
        reply: `## Most ordered items\n\n${top.map((item, i) => `${i + 1}. **${item.name}** (${item.code}) — **${item.totalQty}** units · ${item.orderCount} orders`).join('\n')}${chartBlock('Top ordered (qty)', top.map((t) => t.code.slice(0, 12)), top.map((t) => t.totalQty))}`,
      };
    }

    case 'order_summary':
      return {
        source: 'live-index',
        intent,
        reply: `## Order summary\n\n- **Total orders:** ${orders.total}\n- **Last 30 days:** ${orders.last30Count}\n\n### Status (30d)\n${Object.entries(orders.statusBreakdown).map(([s, n]) => `- **${s}:** ${n}`).join('\n') || '—'}\n\n### Recent\n${orders.recent.slice(0, 5).map((o) => `- ${fmtDate(o.createdAt)} · ${o.customer} · ${money(o.totalExVat)}`).join('\n') || '—'}`,
      };

    case 'search_top': {
      const top = search.topSearches.slice(0, 10);
      if (!top.length) return { source: 'live-index', intent, reply: 'No search data in the last 30 days.' };
      return {
        source: 'live-index',
        intent,
        reply: `## Top searches (30d)\n\n${top.map((r, i) => `${i + 1}. **${r.normalized_search_term}** — ${r.searches}`).join('\n')}${chartBlock('Top searches', top.map((r) => r.normalized_search_term.slice(0, 14)), top.map((r) => Number(r.searches)))}`,
      };
    }

    case 'search_zero': {
      const rows = search.zeroResultTerms.slice(0, 10);
      if (!rows.length) return { source: 'live-index', intent, reply: 'No zero-result searches in the last 30 days.' };
      return {
        source: 'live-index',
        intent,
        reply: `## Zero-result searches\n\n${rows.map((r) => `- **${r.normalized_search_term}** — ${r.search_count}×`).join('\n')}${chartBlock('No-result terms', rows.map((r) => r.normalized_search_term.slice(0, 14)), rows.map((r) => Number(r.search_count)))}`,
      };
    }

    case 'search_to_orders': {
      const rows = search.searchesToOrders.slice(0, 10);
      if (!rows.length) return { source: 'live-index', intent, reply: 'No search-to-order data yet.' };
      return {
        source: 'live-index',
        intent,
        reply: `## Search → order\n\n${rows.map((r) => `- **${r.normalized_search_term}** — ${r.searches} searches → ${r.orders} orders (${r.conversion}%)`).join('\n')}`,
      };
    }

    default:
      return null;
  }
}
