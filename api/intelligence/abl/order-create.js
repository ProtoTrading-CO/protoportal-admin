import { parseOrderCommand } from '../../_order-workspace-core.js';

/**
 * Deterministic Apollo Business Language patterns for order workspace creation.
 * @returns {{ customerQuery: string, command: string, proposedLines: object[], phrase: string }|null}
 */
export function parseOrderCreatePhrase(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const slash = parseOrderCommand(raw);
  if (slash) {
    return {
      customerQuery: slash.customerQuery,
      command: slash.command,
      proposedLines: [],
      phrase: 'slash_order',
    };
  }

  const patterns = [
    {
      phrase: 'create_order_for',
      re: /^(?:create|start|open)\s+(?:an?\s+)?(?:new\s+)?order\s+(?:for|with|from)\s+(.+)$/i,
      customer: 1,
    },
    {
      phrase: 'new_order_from',
      re: /^new\s+order\s+from\s+(.+)$/i,
      customer: 1,
    },
    {
      phrase: 'customer_placed_order',
      re: /^(.+?)\s+placed\s+(?:an?\s+)?(?:another\s+)?order(?:\s+today)?[.!]?$/i,
      customer: 1,
    },
    {
      phrase: 'customer_ordered_products',
      re: /^(.+?)\s+ordered\s+(?:another\s+)?(\d+)\s+(.+?)[.!]?$/i,
      customer: 1,
      qty: 2,
      product: 3,
    },
    {
      phrase: 'customer_ordered_generic',
      re: /^(.+?)\s+ordered\s+(?:another\s+)?(?:order\s+)?(?:for\s+)?(.+?)[.!]?$/i,
      customer: 1,
      product: 2,
    },
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern.re);
    if (!match) continue;
    const customerQuery = cleanCustomerQuery(match[pattern.customer]);
    if (!customerQuery) continue;

    const proposedLines = [];
    if (pattern.qty && pattern.product) {
      const qty = Number(match[pattern.qty]);
      const description = cleanProductDescription(match[pattern.product]);
      if (Number.isFinite(qty) && qty > 0 && description) {
        proposedLines.push({ requestedQty: qty, description });
      }
    } else if (pattern.product) {
      const description = cleanProductDescription(match[pattern.product]);
      if (description && !/^order$/i.test(description)) {
        proposedLines.push({ requestedQty: 0, description });
      }
    }

    return {
      customerQuery,
      command: raw,
      proposedLines,
      phrase: pattern.phrase,
    };
  }

  return null;
}

function cleanCustomerQuery(value) {
  return String(value || '')
    .replace(/\s+(today|yesterday|please)[.!]?$/i, '')
    .replace(/[.!]+$/, '')
    .trim();
}

function cleanProductDescription(value) {
  return String(value || '')
    .replace(/\s+today[.!]?$/i, '')
    .replace(/[.!]+$/, '')
    .trim();
}
