import { parseOrderCreatePhrase } from '../../abl/order-create.js';

/**
 * Lightweight intent classification — no database lookups.
 */
export function classifyActionIntent(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  if (parseOrderCreatePhrase(raw)) {
    return { kind: 'order_workspace_create', isNewAction: true };
  }
  if (parseOrderLineAddPhrase(raw)) {
    return { kind: 'order_line_add', isNewAction: true };
  }
  if (parseMemoryPhrase(raw)) {
    return { kind: 'memory_create', isNewAction: true };
  }
  if (parseSupplierEventPhrase(raw)) {
    return { kind: 'supplier_event', isNewAction: true };
  }
  if (parseContainerEventPhrase(raw)) {
    return { kind: 'container_event', isNewAction: true };
  }

  return { kind: 'unknown', isNewAction: false };
}

/**
 * @returns {{ requestedQty: number, description: string, phrase: string }|null}
 */
export function parseOrderLineAddPhrase(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const patterns = [
    {
      phrase: 'add_another_qty_product',
      re: /^add\s+another\s+(\d+)\s+(.+?)[.!]?$/i,
    },
    {
      phrase: 'add_another_qty',
      re: /^add\s+another\s+(\d+)[.!]?$/i,
      qtyOnly: true,
    },
    {
      phrase: 'add_qty_product',
      re: /^(?:add|include)\s+(?:another\s+)?(\d+)\s+(.+?)[.!]?$/i,
    },
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern.re);
    if (!match) continue;
    const requestedQty = Number(match[1]);
    const description = pattern.qtyOnly
      ? ''
      : String(match[2] || '').replace(/[.!]+$/, '').trim();
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) continue;
    if (!pattern.qtyOnly && !description) continue;
    return { requestedQty, description, phrase: pattern.phrase };
  }

  return null;
}

/**
 * @returns {{ statement: string, phrase: string }|null}
 */
export function parseMemoryPhrase(query) {
  const raw = String(query || '').trim();
  const match = raw.match(/^remember\s+(?:that\s+)?(?:she|he|they)\s+(.+?)[.!]?$/i)
    || raw.match(/^remember\s+(.+?)[.!]?$/i);
  if (!match) return null;
  const statement = String(match[1] || '').replace(/[.!]+$/, '').trim();
  if (!statement) return null;
  return { statement, phrase: 'remember_statement' };
}

/**
 * @returns {{ phrase: string }|null}
 */
export function parseSupplierEventPhrase(query) {
  const raw = String(query || '').trim();
  if (/^(?:they(?:'re| are)|he(?:'s| is)|she(?:'s| is))\s+running\s+late[.!]?$/i.test(raw)) {
    return { phrase: 'supplier_running_late' };
  }
  if (/^(?:they(?:'re| are)|he(?:'s| is)|she(?:'s| is))\s+(?:delayed|behind)[.!]?$/i.test(raw)) {
    return { phrase: 'supplier_delayed' };
  }
  return null;
}

/**
 * @returns {{ phrase: string }|null}
 */
export function parseContainerEventPhrase(query) {
  const raw = String(query || '').trim();
  if (/^it\s+arrived(?:\s+today)?[.!]?$/i.test(raw)) {
    return { phrase: 'container_arrived' };
  }
  if (/^it\s+(?:has\s+)?landed[.!]?$/i.test(raw)) {
    return { phrase: 'container_landed' };
  }
  return null;
}

export { parseOrderCreatePhrase };
