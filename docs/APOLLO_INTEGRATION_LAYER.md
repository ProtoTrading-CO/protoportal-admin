# Apollo Integration Layer

**Status:** Implementation spec (Capability 1+)  
**Last updated:** 2026-07-09  
**Branch:** `apollo-core`  
**Foundation:** `docs/APOLLO_MISSION.md` (frozen) · `docs/APOLLO_EDUCATION_PLAN.md`

---

## Objective

Apollo is Proto's **single intelligence layer**. Not "linking systems" — **one place that understands the business**.

Apollo does not own data. Apollo understands data.

```
ERP (BLADERUNNER) ──┐
Website            ──┤
CRM                ──┤
Knowledge Vault    ──┼──> Apollo
Analytics          ──┤
Email (future)     ──┘
```

---

## Core rule

**Apollo never queries SQL directly.**

Apollo requests **Contexts**. Each Context gathers from ERP, Website, CRM, Knowledge, and Apollo Memory — and returns **one unified Business Object**.

The Context decides whether to use SQL, Supabase, website APIs, or Memory. Apollo chat and Intent Engine do not care.

---

## Pipeline (target)

```
User input
    ↓
Intent Engine
    ↓
Entity Resolver          ← missing piece (Apollo Registry)
    ↓
Business Context
    ↓
Truth (Query Engine)
    ↓
Apollo Memory (when built)
    ↓
Reasoning
    ↓
Recommendation
```

Today: Intent Engine routes **questions**. Tomorrow: Intent Engine + Entity Resolver route **objects**.

| User types | Resolves to | Context loaded |
|------------|-------------|----------------|
| `Addie` | Customer | Customer Context |
| `8614001234` | Product (SKU) | Product Context |
| `Motarro` | Supplier | Supplier Context |
| `Container 57` | Container | Container Context |

---

## Apollo Registry

One registry. Every business entity has an ID and a Context loader.

| Entity | Context module | Status on `apollo-core` |
|--------|----------------|-------------------------|
| Product | `bi/contexts/product.js` | **Partial** |
| Customer | `bi/contexts/customer.js` | **Partial** |
| Supplier | — | Not built |
| Order | via customer portal queries | Partial |
| Container | — | Not built |
| Website | daily-brief sections | Partial |
| Inventory | `bi/contexts/inventory.js` | Live |
| Memory | — | Phase B |
| Knowledge | vault (future) | Not built |
| Recommendation | — | Phase C/D |

**Existing building blocks:**

- Query registry: `api/intelligence/query-engine/registry.js`
- Intent registry: `api/intelligence/intent-engine/registry.js`
- **Entity registry:** `api/intelligence/entity-registry/` — SKU, customer, supplier (stub), container (stub)
- Entity detection: `entity-registry/detect.js`
- Context facade: `api/intelligence/bi/facade.js`

**Capability 1 next:** enrich Product Context fields (ERP margin, history, website analytics).

---

## Context map

| Context | Gathers from | Returns |
|---------|--------------|---------|
| Product Context | ERP, Website, stock, Memory | Unified product object |
| Customer Context | Portal, orders, website, Memory | Unified customer object |
| Buying Context | ERP, stock, Memory | Reorder / forecast intelligence |
| Supplier Context | ERP, Memory, email (future) | Supplier intelligence |
| Money Context | ERP, stock valuation | Margin / cash / turns |
| Memory Context | Apollo Memory graph | Lessons, decisions, outcomes for entity |

---

## Integration phases

### Phase 1 — Entry point (this week)

All intelligence flows through Apollo APIs (`/api/apollo`, `/api/apollo-experience`). No parallel ad-hoc SQL from chat layer.

**Gate:** Live SQL smoke (`vercel dev` → `GET /api/apollo`).

### Phase 2 — Teach Products (Capability 1)

For every SKU, Product Context must know:

| Source | Fields |
|--------|--------|
| **ERP** | Description, department, supplier, cost, selling prices, margin, on hand, on order, last sale, sales history |
| **Website** | Live?, hidden?, images, SEO status, category, views, conversions |
| **Business** | Seasonal?, core range?, new?, slow mover?, replacement? |
| **Memory** | Previous buying decisions, recommendations, lessons |

Graduation: `docs/APOLLO_EDUCATION_PLAN.md` Capability 1 questions.

### Phase 3 — Teach Customers

Customer as one object:

```
Customer → Sales → Products → Payment → Margins → Patterns → Website → Memory → Recommendations
```

### Phase 4 — Teach Suppliers

Supplier **intelligence** (not a supplier database): lead times, delays, quality, margins, substitutes, communication, reliability.

### Phase 5 — Teach Money

Cashflow, gross profit, stock value, dead stock, inventory turns.

### Phase 6 — Memory links everything

*"Tell me about Addie"* → one graph traversal:

```
Customer → ERP → Website → Emails → Buying history → Memory → Decisions → Recommendations → Today's changes
```

---

## Product Context — current vs target

**Already in `product.js`:** ERP via `erp.product_by_code`, website listing, stmast cache, SOH, supplier name, status.

**Gaps (Capability 1 work):**

- Margin, cost, on order, last sale, sales history (ERP queries)
- Views, conversions, SEO (website/analytics)
- Business flags (seasonal, core range, slow mover)
- Memory slice (stub until Phase B)

Each gap = one registered query + context field + test.

---

## Success criteria (Capability 1)

- [x] Apollo Registry resolves SKU → Product Context
- [x] Apollo Registry resolves customer name/id → Customer Context
- [x] Apollo Registry resolves supplier name → Supplier Context (stub)
- [x] Apollo Registry resolves container reference → Container Context (stub)
- [x] Intent Engine wired through Entity Resolver
- [ ] No direct SQL/adapter calls from `api/apollo.js` or Intent Engine — Contexts only (audit remaining paths)
- [x] Typing a SKU in chat routes to Product Context
- [ ] Graduation questions in Education Plan answerable with evidence

---

## Engineering prompt (start here)

> We are entering Capability 1. Apollo is the central intelligence layer for Proto.
>
> Implement Apollo Registry for entity resolution (Product, Customer, Supplier, Order, Container).
> Wire Intent Engine → Entity Resolver → Business Context.
> Apollo must never query SQL directly — Contexts call Query Engine.
> Enrich Product Context per Integration Layer field matrix.
> Success: typing a SKU opens Product Context with unified Business Object.

No new architecture docs. No new philosophy. Build under freeze.
