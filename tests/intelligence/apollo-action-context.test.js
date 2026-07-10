import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inferActionContext,
  resolveActionContext,
} from '../../api/intelligence/apollo-action-engine/context/index.js';
import { handleApolloAction } from '../../api/intelligence/apollo-action-engine/index.js';

const addie = {
  id: 'cust-addie',
  business_name: 'Addie Gifts',
  name: 'Addie',
  contact_name: 'Addie Smith',
  email: 'addie@example.com',
};

const addieWorkspace = {
  id: 'ws-addie-1',
  status: 'Quoted',
  customer_id: 'cust-addie',
  supplier: 'Motarro',
  due_date: '2026-07-20',
  command: 'Create an order for Addie',
  updated_at: '2026-07-10T10:00:00.000Z',
  customer: {
    customer_id: 'cust-addie',
    customer_name: 'Addie Gifts',
    business_name: 'Addie Gifts',
  },
  lines: [{ description: 'wallets', requested_qty: 500 }],
  timeline: [{ event_type: 'status_change', summary: 'Quoted' }],
  promises: [],
  reminders: [],
  tasks: [],
  files: [],
  deadlines: null,
};

vi.mock('../../api/order-workspaces.js', () => ({
  findCustomers: vi.fn(),
  loadWorkspace: vi.fn(),
}));

import { findCustomers, loadWorkspace } from '../../api/order-workspaces.js';

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

describe('Apollo Context Resolver — active workspace inheritance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWorkspace.mockImplementation(async (_supabase, id) => (
      id === addieWorkspace.id ? addieWorkspace : null
    ));
  });

  it('inherits the active Addie workspace from conversationContext.activeWorkspaceId', async () => {
    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'Add another 300 wallets',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: { activeWorkspaceId: addieWorkspace.id },
    });

    expect(context.activeWorkspace.id).toBe('ws-addie-1');
    expect(context.inherited.customerName).toBe('Addie Gifts');
    expect(context.inherited.supplier).toBe('Motarro');
    expect(context.inherited.dueDate).toBe('2026-07-20');
    expect(context.sources).toContain('conversation');
  });

  it('inherits customer from recent proposedAction conversation state', async () => {
    const supabase = createSupabaseMock();
    loadWorkspace.mockResolvedValue(null);

    const context = await resolveActionContext({
      query: 'Remember she likes black packaging',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {
        proposedAction: {
          customerId: 'cust-addie',
          customerName: 'Addie Gifts',
          workspaceId: 'ws-addie-1',
        },
      },
    });

    expect(context.recentConversation.proposedAction.customerId).toBe('cust-addie');
    expect(context.activeCustomer.id).toBe('cust-addie');
    expect(context.sources).toContain('conversation');
  });

  it('falls back to the most recently updated non-completed workspace', async () => {
    const supabase = createSupabaseMock([
      { id: 'ws-addie-1', status: 'Quoted', customer_id: 'cust-addie', updated_at: '2026-07-10T10:00:00.000Z' },
      { id: 'ws-old', status: 'Draft', customer_id: 'cust-other', updated_at: '2026-07-01T10:00:00.000Z' },
    ]);

    const context = await resolveActionContext({
      query: 'status update',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {},
    });

    expect(context.activeWorkspace.id).toBe('ws-addie-1');
    expect(context.sources).toContain('workspace');
  });
});

describe('Apollo Context Resolver — acceptance scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWorkspace.mockImplementation(async (_supabase, id) => (
      id === addieWorkspace.id ? addieWorkspace : null
    ));
  });

  it('active order: Add another 300 wallets inherits customer, supplier, workspace, due date', async () => {
    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'Add another 300 wallets',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: { activeWorkspaceId: addieWorkspace.id },
    });
    const inference = inferActionContext('Add another 300 wallets', context);

    expect(inference.needsClarification).toBe(false);
    expect(inference.intent).toBe('order_line_add');
    expect(inference.entities).toMatchObject({
      workspaceId: 'ws-addie-1',
      customerId: 'cust-addie',
      customerName: 'Addie Gifts',
      supplier: 'Motarro',
      dueDate: '2026-07-20',
      proposedLine: { requestedQty: 300, description: 'wallets' },
    });
    expect(inference.clarificationQuestion).toBeNull();
  });

  it('memory example: Remember she likes black packaging inherits Addie without lookup', async () => {
    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'Remember she likes black packaging',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: { activeWorkspaceId: addieWorkspace.id },
    });
    const inference = inferActionContext('Remember she likes black packaging', context);

    expect(findCustomers).not.toHaveBeenCalled();
    expect(context.activeCustomer.id).toBe('cust-addie');
    expect(inference.needsClarification).toBe(false);
    expect(inference.entities.customerName).toBe('Addie Gifts');
  });

  it('supplier: They are running late inherits Motarro from waiting supplier workspace', async () => {
    const waitingWorkspace = {
      ...addieWorkspace,
      status: 'Waiting Supplier',
      supplier: 'Motarro',
    };
    loadWorkspace.mockResolvedValue(waitingWorkspace);

    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: "They're running late",
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: { activeWorkspaceId: waitingWorkspace.id },
    });
    const inference = inferActionContext("They're running late", context);

    expect(context.activeSupplier.name).toBe('Motarro');
    expect(inference.needsClarification).toBe(false);
    expect(inference.entities.supplierName).toBe('Motarro');
  });

  it('container: It arrived today inherits container from conversationContext', async () => {
    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'It arrived today',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {
        activeContainer: { reference: 'Container 42', entityId: 'Container 42', number: '42' },
      },
    });
    const inference = inferActionContext('It arrived today', context);

    expect(context.activeContainer.reference).toBe('Container 42');
    expect(inference.needsClarification).toBe(false);
    expect(inference.entities.reference).toBe('Container 42');
  });

  it('unknown context: Add another 300 asks for clarification', async () => {
    const supabase = createSupabaseMock([]);
    loadWorkspace.mockResolvedValue(null);

    const context = await resolveActionContext({
      query: 'Add another 300',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {},
    });
    const inference = inferActionContext('Add another 300', context);

    expect(inference.needsClarification).toBe(true);
    expect(inference.clarificationQuestion).toMatch(/which order or customer/i);
  });
});

describe('Apollo Context Resolver — confidence and source tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWorkspace.mockResolvedValue(addieWorkspace);
    findCustomers.mockResolvedValue([addie]);
  });

  it('tracks multiple sources and raises confidence when workspace + customer align', async () => {
    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'Create an order for Addie',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {
        activeWorkspaceId: addieWorkspace.id,
        proposedAction: { customerId: 'cust-addie', customerName: 'Addie Gifts' },
      },
    });

    expect(context.sources).toEqual(expect.arrayContaining(['conversation', 'entity_registry']));
    expect(context.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('marks ambiguous customer resolution without selecting a customer', async () => {
    findCustomers.mockResolvedValue([
      { id: '1', business_name: 'Addie Gifts', name: 'Addie Gifts Ltd' },
      { id: '2', business_name: 'Addie Wholesale', name: 'Addie Wholesale Pty' },
    ]);

    const supabase = createSupabaseMock();
    const context = await resolveActionContext({
      query: 'Create an order for Addie',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {},
    });

    expect(context.customerResolution.ambiguous).toBe(true);
    expect(context.customerResolution.matches).toHaveLength(2);
    expect(context.activeCustomer).toEqual({});
  });
});

describe('Apollo Context Resolver — pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findCustomers.mockResolvedValue([addie]);
    loadWorkspace.mockResolvedValue(addieWorkspace);
  });

  it('proposes an order line update without asking which customer', async () => {
    const supabase = createSupabaseMock();
    const result = await handleApolloAction({
      query: 'Add another 300 wallets',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: { activeWorkspaceId: addieWorkspace.id },
    });

    expect(result.intent).toBe('order_line_add_proposed');
    expect(result.proposedAction).toMatchObject({
      type: 'order_line_add',
      workspaceId: 'ws-addie-1',
      customerId: 'cust-addie',
      customerName: 'Addie Gifts',
    });
    expect(result.reply).not.toMatch(/which customer/i);
    expect(result.reply).toMatch(/300 wallets/i);
  });

  it('asks for clarification when context is unknown', async () => {
    loadWorkspace.mockResolvedValue(null);
    const supabase = createSupabaseMock([]);

    const result = await handleApolloAction({
      query: 'Add another 300',
      supabase,
      actor: 'george@proto.co.za',
      conversationContext: {},
    });

    expect(result.intent).toBe('context_clarification');
    expect(result.reply).toMatch(/which order or customer/i);
  });
});
