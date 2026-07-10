# Apollo Development Covenant

Apollo exists to progressively take responsibility for Proto's operational
workload while preserving human judgement.

Apollo does not replace people. Apollo reduces operational burden, improves
business judgement, and preserves institutional knowledge. Humans remain
accountable for consequential decisions.

From this point forward, Apollo is measured by business responsibility, not by
lines of code, API count, routing complexity, or architectural novelty.

## Four permanent principles

### 1. Business before technology

Every release must improve Proto's operation, not Apollo's architecture.

### 2. Responsibility before intelligence

Apollo earns the right to manage another part of Proto. It does not earn points
for sounding intelligent.

### 3. Truth before opinion

Apollo reasons from evidence: ERP, website, memory, business rules, and sourced
facts. Never assumptions.

### 4. Human authority

Apollo recommends. Humans approve. Always.

## Pull request constitution

Every Apollo pull request must answer four questions:

1. **Business:** What manual process disappears or materially improves?
2. **Responsibility:** What new responsibility does Apollo now own?
3. **Evidence:** How will we prove it works?
4. **Rollback:** If this fails tomorrow morning, how do we safely undo it?

If a pull request cannot answer those questions, it probably should not be
built yet.

## Responsibility ladder

Every Workspace should move Apollo higher on this ladder:

0. **Observes** — "I know."
1. **Explains** — "I understand."
2. **Remembers** — "I won't forget."
3. **Manages** — "I'll keep track."
4. **Coordinates** — "I'll connect everything."
5. **Advises** — "I think you should do this."
6. **Institutional Memory** — "I remember why we made this decision years ago."

## Sprint framing

Every sprint should complete this sentence:

> **Apollo will become responsible for ________.**

Examples: customer orders, supplier reminders, container tracking, buying
recommendations.

## Roadmap v2

### Phase 0 — Foundation

SQL Bridge, routing, memory foundation, product governance, deployment, and
infrastructure.

**Status:** Complete pending final deployment gate and Infrastructure Freeze.

### Phase 1 — Operational Workspaces

Every sprint removes or materially improves one manual process.

1. Orders Workspace
2. Customers Workspace
3. Containers Workspace
4. Buying Workspace
5. Suppliers Workspace
6. Daily Brief

### Phase 2 — Connected Intelligence

Apollo connects business objects into complete workflows:

Customer -> Order -> Supplier -> Container -> Stock -> Invoice -> Follow-up -> Memory

### Phase 3 — Proactive Management

Apollo notices sourced exceptions, risks, promises, and opportunities before
being asked, then recommends human-approved action.

### Phase 4 — Institutional Memory

Apollo preserves years of decisions, lessons, patterns, supplier experiences,
customer behaviour, product knowledge, and outcomes.

## Orders Workspace benchmark

Canonical v1 spec: `docs/ORDERS_WORKSPACE_V1_SPEC.md`.

The first Workspace succeeds when:

- `/order Addie` creates a durable Order Workspace.
- Excel order files can be uploaded.
- Apollo extracts proposed products.
- A human approves extracted lines before saving.
- Apollo creates tasks and reminders.
- Apollo records promises and decisions.
- Apollo keeps an immutable timeline.
- The workspace can be reopened later from a stable URL.
- Gee no longer needs the customer-order notebook for that process.

## North star

> Every completed Workspace should make Proto run a little better than it did
> the week before.

Apollo earns responsibility one business process at a time.

Apollo is successful when Proto cannot imagine running without it — not because
it replaced people, but because it quietly removed operational friction,
preserved business knowledge, and helped people make better decisions every day.
