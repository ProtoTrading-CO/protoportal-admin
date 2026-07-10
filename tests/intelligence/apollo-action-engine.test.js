import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseOrderCreatePhrase } from '../../api/intelligence/abl/order-create.js';
import {
  buildProposedAction,
  executeOrderWorkspaceCreate,
  proposeOrderWorkspaceCreate,
} from '../../api/intelligence/apollo-action-engine/handlers/orders.js';
import {
  handleApolloAction,
  isConfirmationMessage,
} from '../../api/intelligence/apollo-action-engine/index.js';
import { resolveIntent } from '../../api/intelligence/intent-engine/index.js';

const addie = {
  id: 'cust-addie',
  business_name: 'Addie Gifts',
  name: 'Addie',
  contact_name: 'Addie Smith',
  email: 'addie@example.com',
};

const workspaceRow = {
  id: 'ws-1',
  status: 'Draft',
  customer: { customer_name: 'Addie Gifts' },
  lines: [],
};

vi.mock('../../api/order-workspaces.js', () => ({
  findCustomers: vi.fn(),
  createWorkspace: vi.fn(),
  addWorkspaceLine: vi.fn(),
  loadWorkspace: vi.fn(),
}));

import { findCustomers, createWorkspace, addWorkspaceLine, loadWorkspace } from '../../api/order-workspaces.js';

function createSupabaseMock(workspaces = []) {
  const chain = {
    select: vi.fn(function select() { return chain; }),
    not: vi.fn(function not() { return chain; }),
    is: vi.fn(function is() { return chain; }),
    order: vi.fn(function order() { return chain; }),
    limit: vi.fn(async () => ({ data: workspaces, error: null })),
    eq: vi.fn(function eq() { return chain; }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  return { from: vi.fn(() => chain) };
}

function ctxWithCustomerResolution(customer, customerQuery, { ambiguous = false, matches = null } = {}) {
  const resolvedMatches = matches || (ambiguous
    ? [
      { id: '1', business_name: 'Addie Gifts', name: 'Addie Gifts Ltd', email: 'a@example.com' },
      { id: '2', business_name: 'Addie Wholesale', name: 'Addie Wholesale Pty', email: 'b@example.com' },
    ]
    : [customer]);

  return {
    supabase: createSupabaseMock(),
    actor: 'george@proto.co.za',
    actionContext: {
      customerResolution: {
        customerQuery,
        customer: ambiguous ? null : customer,
        ambiguous,
        matches: resolvedMatches,
      },
      activeCustomer: ambiguous ? {} : customer,
      confidence: ambiguous ? 0.55 : 0.99,
      sources: ['entity_registry'],
    },
  };
}

describe('Apollo Action Engine — ABL order-create phrases', () => {
  it('supports natural-language order-create phrases', () => {
    expect(parseOrderCreatePhrase('Create an order for Addie')).toMatchObject({
      customerQuery: 'Addie',
      phrase: 'create_order_for',
    });
    expect(parseOrderCreatePhrase('New order from Addie')).toMatchObject({
      customerQuery: 'Addie',
      phrase: 'new_order_from',
    });
    expect(parseOrderCreatePhrase('Addie placed an order')).toMatchObject({
      customerQuery: 'Addie',
      phrase: 'customer_placed_order',
    });
    expect(parseOrderCreatePhrase('ABC Stationers placed another order today')).toMatchObject({
      customerQuery: 'ABC Stationers',
      phrase: 'customer_placed_order',
    });
    expect(parseOrderCreatePhrase('Addie ordered another 500 wallets')).toMatchObject({
      customerQuery: 'Addie',
      phrase: 'customer_ordered_products',
      proposedLines: [{ requestedQty: 500, description: 'wallets' }],
    });
  });

  it('routes slash commands through the same ABL parser', () => {
    expect(parseOrderCreatePhrase('/order Addie')).toMatchObject({
      customerQuery: 'Addie',
      command: '/order Addie',
      phrase: 'slash_order',
    });
  });

  it('does not treat bare order text without a customer as an action', () => {
    expect(parseOrderCreatePhrase('order Addie')).toBeNull();
    expect(parseOrderCreatePhrase('Show product 8610100001')).toBeNull();
  });
});

describe('Apollo Action Engine — order workspace proposals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWorkspace.mockResolvedValue(null);
  });

  it('proposes confirmation for a resolved customer with confidence', async () => {
    const ctx = ctxWithCustomerResolution(addie, 'Addie');
    const parsed = parseOrderCreatePhrase('Create an order for Addie');
    const result = await proposeOrderWorkspaceCreate(ctx, parsed);

    expect(result.intent).toBe('order_workspace_confirm');
    expect(result.proposedAction).toMatchObject({
      type: 'order_workspace_create',
      status: 'proposed',
      customerId: 'cust-addie',
      customerName: 'Addie Gifts',
      requiresConfirmation: true,
      confidence: 0.99,
      reason: "Matched customer 'Addie Gifts'",
    });
    expect(result.reply).toMatch(/confirm/i);
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('asks for clarification when multiple customers match', async () => {
    const ctx = ctxWithCustomerResolution(null, 'Addie', { ambiguous: true });
    const parsed = parseOrderCreatePhrase('Create an order for Addie');
    const result = await proposeOrderWorkspaceCreate(ctx, parsed);

    expect(result.intent).toBe('order_workspace_disambiguation');
    expect(result.proposedAction.status).toBe('select_customer');
    expect(result.proposedAction.confidence).toBeLessThan(0.7);
    expect(result.matches).toHaveLength(2);
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('reports unknown customers instead of creating a weak match', async () => {
    const ctx = ctxWithCustomerResolution(null, 'Unknown Co', { matches: [] });
    const parsed = parseOrderCreatePhrase('Create an order for Unknown Co');
    const result = await proposeOrderWorkspaceCreate(ctx, parsed);

    expect(result.intent).toBe('order_workspace_customer_not_found');
    expect(result.proposedAction).toBeUndefined();
    expect(createWorkspace).not.toHaveBeenCalled();
  });
});

describe('Apollo Action Engine — confirmation and execution', () => {
  const ctx = { supabase: createSupabaseMock(), actor: 'george@proto.co.za' };

  beforeEach(() => {
    vi.clearAllMocks();
    findCustomers.mockResolvedValue([addie]);
    loadWorkspace.mockResolvedValue(null);
    createWorkspace.mockResolvedValue({ row: workspaceRow });
    addWorkspaceLine.mockResolvedValue({
      ...workspaceRow,
      lines: [{ description: 'wallets', requested_qty: 500 }],
    });
  });

  it('requires explicit confirmation before execution', async () => {
    const proposed = await handleApolloAction({
      query: 'Create an order for Addie',
      supabase: createSupabaseMock(),
      actor: ctx.actor,
    });
    expect(proposed.intent).toBe('order_workspace_confirm');
    expect(createWorkspace).not.toHaveBeenCalled();

    const confirmed = await handleApolloAction({
      query: 'confirm',
      proposedAction: proposed.proposedAction,
      supabase: createSupabaseMock(),
      actor: ctx.actor,
    });
    expect(confirmed.intent).toBe('order_workspace_create');
    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(confirmed.workspace.id).toBe('ws-1');
  });

  it('executes slash and natural-language proposals through the same path', async () => {
    const slash = await handleApolloAction({ query: '/order Addie', supabase: createSupabaseMock(), actor: ctx.actor });
    expect(slash.intent).toBe('order_workspace_confirm');

    const natural = await handleApolloAction({ query: 'New order from Addie', supabase: createSupabaseMock(), actor: ctx.actor });
    expect(natural.intent).toBe('order_workspace_confirm');
    expect(natural.proposedAction.customerId).toBe(slash.proposedAction.customerId);
  });

  it('adds high-confidence product lines after confirmed execution', async () => {
    const proposed = await handleApolloAction({
      query: 'Addie ordered another 500 wallets',
      supabase: createSupabaseMock(),
      actor: ctx.actor,
    });
    expect(proposed.proposedAction.proposedLines).toEqual([{ requestedQty: 500, description: 'wallets' }]);

    await handleApolloAction({
      query: 'confirm',
      proposedAction: proposed.proposedAction,
      supabase: createSupabaseMock(),
      actor: ctx.actor,
    });

    expect(addWorkspaceLine).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      'ws-1',
      expect.objectContaining({
        line: expect.objectContaining({ description: 'wallets', requestedQty: 500 }),
      }),
    );
  });

  it('does not execute the same proposed action twice', async () => {
    const proposed = buildProposedAction({
      status: 'executed',
      customerId: addie.id,
      customerName: 'Addie Gifts',
      workspaceId: 'ws-1',
      command: 'Create an order for Addie',
      customerQuery: 'Addie',
    });

    const result = await executeOrderWorkspaceCreate(ctx, proposed);
    expect(result.intent).toBe('order_workspace_already_created');
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('accepts confirmAction without repeating the word confirm', () => {
    expect(isConfirmationMessage('thanks', { confirmAction: true })).toBe(true);
    expect(isConfirmationMessage('thanks', { confirmAction: false })).toBe(false);
  });
});

describe('Apollo Action Engine — architecture guards', () => {
  it('keeps apollo.js free of workspace-specific branching', () => {
    const source = readFileSync('api/apollo.js', 'utf8');
    expect(source).toMatch(/handleApolloAction/);
    expect(source).toMatch(/apollo-action-engine/);
    expect(source).not.toMatch(/parseOrderCommand/);
    expect(source).not.toMatch(/createWorkspace\(/);
  });

  it('leaves BI read routing unaffected for lookup questions', () => {
    const resolved = resolveIntent('Tell me about Addie');
    expect(resolved?.ok).toBe(true);
    expect(resolved?.intentId).toBe('customer_lookup');
  });

  it('stores proposedAction and conversationContext in ApolloPanel chat requests', () => {
    const source = readFileSync('src/components/ApolloPanel.jsx', 'utf8');
    expect(source).toMatch(/proposedActionRef/);
    expect(source).toMatch(/proposedAction: proposedActionRef\.current/);
    expect(source).toMatch(/conversationContext/);
  });

  it('routes action input through Context Resolver before handlers', () => {
    const source = readFileSync('api/intelligence/apollo-action-engine/index.js', 'utf8');
    expect(source).toMatch(/resolveActionContext/);
    expect(source).toMatch(/inferActionContext/);
    expect(source).not.toMatch(/findCustomers/);
  });
});
