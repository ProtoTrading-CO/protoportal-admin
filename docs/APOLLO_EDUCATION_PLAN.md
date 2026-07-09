# Apollo Education Plan

**Status:** Active curriculum (evolves through graduation criteria only)  
**Last updated:** 2026-07-09  
**Branch:** `apollo-core`  
**Foundation:** `docs/APOLLO_MISSION.md` (frozen v1.0)

---

## Apollo v1.0 Architecture Freeze

**Architecture freeze — not feature freeze.**

Stable (do not redesign without implementation proof):

- Apollo Mission v1.0
- AES-001 Read-Only Observer
- Six pillars + Curiosity
- Memory Model · Promotion Engine · Apollo Memory
- Maturity levels (Aware → Understanding → Judgement → Wisdom)
- One graph · Knowledge Promotion · Git model

**Rule:** No new philosophy unless implementation proves something is fundamentally wrong.

From here: **educate Apollo**, don't redesign Apollo.

---

## Engineering discipline

> Every line of code added to Apollo should increase its understanding of Proto.

If a feature doesn't do that, ask whether it belongs in Apollo at all.

---

## Apollo Education Roadmap

Not PR numbers. Not React, SQL, or APIs — those are implementation details.

**Capabilities are what matter.**

| # | Capability | Status |
|---|------------|--------|
| 1 | Apollo understands **Products** | **In progress** |
| 2 | Apollo understands **Customers** | Not started |
| 3 | Apollo understands **Buying** | Not started |
| 4 | Apollo understands **Suppliers** | Not started |
| 5 | Apollo understands **Money** | Not started |
| 6 | Apollo understands **Proto** | Not started |

Scoreboard: `docs/CURRENT_APOLLO_CAPABILITIES.md`

---

## How education works

Each capability has **graduation questions**. Apollo graduates when it can answer them with evidence — Truth + Context, and Memory where Phase B+ applies.

One capability at a time. Graduate before moving on.

### Capability stages (every sub-capability)

| Stage | Behaviour | Example |
|-------|-----------|---------|
| **1 — Not taught** | Honest limitation — understands intent, refuses to guess | _"I don't yet have the knowledge to answer reliably."_ |
| **2 — Learning** | Answers with partial confidence | Evidence present · confidence ~60–90% |
| **3 — Graduated** | Full evidence chain | Truth · Context · complete provenance |

### Capability Router (Apollo Curriculum)

```
User → Intent Engine → Curriculum check → Business Context → Query Engine → Truth → Response
```

Intent-first routing (1.1A): classify **what** before **who/which entity**.

**Full report card & graduation conversations:** `docs/APOLLO_CURRICULUM.md`

### Graduation conversations (business acceptance)

Each sub-capability graduates only after a **real business conversation** passes — not unit tests alone.

| Sprint | User says | Apollo must demonstrate |
|--------|-----------|-------------------------|
| 1.1 | Tell me about SKU 8626100145 | Product, dept, live stock, supplier, evidence |
| 1.2 | Is this product actually making us money? | Cost, price, margin, trend, evidence |
| 1.3 | What sold best today? | Top products, quantities, revenue, trend, evidence |
| 1.4 | Why is this product selling? | Last sale, velocity, seasonality, stock cover |
| 1.5 | Should we reorder this product? | Recommendation from evidence — not guess |

**Sprint question:** *What business question can Apollo answer after this sprint that it couldn't answer before?*

**Rhythm:** Register query → Build context → Add evidence → Pass graduation conversation → Mark graduated.

---

## Capability 1 — Products

**Goal:** Apollo understands Proto's products like an experienced buyer — not a SQL report.

**Rule:** No new architectural work unless implementation exposes a flaw. Every sprint teaches Apollo one new part of Proto.

### Sub-capabilities (teaching order)

| Sprint | Name | Objective | Gate |
|--------|------|-----------|------|
| **1.1** | **Live Product Truth** | Apollo trusts BLADERUNNER as source of truth | ✅ Engineering · Operational on LAN |
| **1.1A** | **Intent-first Routing** | Intent → Entity → Context | ✅ Graduated — `docs/graduations/1.1a-intent-first-routing.md` |
| **1.2** | **Product Profitability** | "We're making money on this product" | `erp.product_margin`, `erp.product_cost`, `erp.product_price_history` |
| **1.3** | **Sales Intelligence** | Top sellers, trends, revenue leaders | `erp.best_selling_today`, `erp.top_products_today`, `erp.top_products_week`, `erp.product_sales_history`, `erp.product_daily_sales`, `erp.product_monthly_sales` |
| **1.4** | **Product Behaviour** | "Why is this selling?" not "how many sold?" | Last sale, seasonality, stock cover, GRV |
| **1.5** | **Product Judgement** | Recommendations from Truth + Context + Reasoning | Buying recommendation with evidence |

**Do not start 1.2 until 1.1 operational criteria pass** on production (`erp_sql` via bridge). 1.1A is graduated.

### Capability 1.1A — Intent-first Routing

**Graduation report:** `docs/graduations/1.1a-intent-first-routing.md`

| Criterion | Status |
|-----------|--------|
| Intent before Entity | ✅ |
| Sales questions → `sales.context` | ✅ |
| Honest "not taught" (no customer misroute) | ✅ |
| `Tell me about Addie` → Customer | ✅ |

### Capability 1.1 — Live Product Truth

Apollo trusts BLADERUNNER for products. **Graduation report:** `docs/graduations/1.1-live-product-truth.md`

| Criterion | Engineering | Operational |
|-----------|-------------|-------------|
| SQL bridge path | ✅ | Pending env |
| `erp.product_by_code` returns `erp_sql` | ✅ (when bridge on) | Pending bridge |
| Product Context prefers live ERP | ✅ | — |
| Every exposed field: Source · Timestamp · Confidence | ✅ | — |
| Verify script | ✅ | Pending `erp_sql` |

Verify: `node scripts/verify-erp-product.mjs 8626100145`

### Capability 1.2 — Product Profitability

Queries: `erp.product_margin`, `erp.product_cost`, `erp.product_price_history`

### Capability 1.3 — Sales Intelligence

Queries: `erp.best_selling_today`, `erp.top_products_today`, `erp.top_products_week`, `erp.product_sales_history`, `erp.product_daily_sales`, `erp.product_monthly_sales`

Sales Context answers: top sellers, worst sellers, fast movers, revenue leaders, period filters (today / week).

### Capability 1.4 — Product Behaviour

Queries: `erp.product_last_sale`, `erp.product_stock_cover`, `erp.product_grv_history`, seasonality

### Capability 1.5 — Product Judgement

Reasoning: consistent sales + margin + conversions + lead time → recommendation with evidence chain.

### Query merge checklist

Every new query must be **yes** on all before merge:

| Question | Required |
|----------|----------|
| Does this increase Apollo's understanding? | ✅ |
| Is it registered in Query Engine? | ✅ |
| Is it read-only (AES-001)? | ✅ |
| Does it expose source? | ✅ |
| Does it expose timestamp? | ✅ |
| Does it expose confidence? | ✅ |
| Is it tested? | ✅ |

### Graduation questions

Apollo graduates Products when it can answer:

| # | Question |
|---|----------|
| 1 | Why is this product selling? |
| 2 | Who buys it? |
| 3 | When does it sell? |
| 4 | Should we reorder it? |
| 5 | Is the margin acceptable? |
| 6 | Is stock healthy? |
| 7 | What changed since last month? |
| 8 | What changed since we last discussed it? |

**Capability complete** → move to Customers.

### Implementation path

**Integration Layer:** `docs/APOLLO_INTEGRATION_LAYER.md`

- Apollo Registry (entity resolution)
- Contexts gather Truth + Memory — Apollo never calls SQL directly
- Enrich `product.js` per field matrix below

### Capability 1 graduation example

*"Tell me about SKU 8626100145"* should read like an experienced buyer — not a SQL dump:

Product · Supplier · Department · Stock · On order · Margin · Last sale · Sales trend · Website · Seasonality · Recommendation · Confidence · Evidence (live ERP, website, history, memory).

### ERP query backlog (register via Query Engine only)

| Priority | Query ID | Answers |
|----------|----------|---------|
| 1 | `erp.product_margin` | Is the margin acceptable? |
| 2 | `erp.product_on_order` | Inbound stock |
| 3 | `erp.product_last_sale` | When did it last sell? |
| 4 | `erp.product_sales_history` | Why is it selling? / trend |
| 5 | `erp.product_stock_cover` | Is stock healthy? |
| 6 | `erp.product_monthly_sales` | Seasonality / monthly pattern |
| 7 | `erp.product_grv_history` | Receipt / supply history |
| 8 | Buying recommendation | Should we reorder? (Reasoning + evidence) |

Every field: **Source · Timestamp · Confidence**. No direct SQL. No Query Engine bypass.

### Environment gate

Live BLADERUNNER requires `STOCK_SQL_BRIDGE_URL` + `STOCK_SQL_BRIDGE_KEY` (or direct `SQL_PASSWORD` on LAN). Verify: `node scripts/verify-erp-product.mjs 8626100145` → expect `dataSource: erp_sql`.

### Current baseline (`apollo-core`)

- Entity Registry + Product routing ✅
- `erp.product_by_code` via Query Engine ✅ (`erp_sql` or `stmast_cache`)
- Product Context prefers live ERP fields when `erp_sql`; cache for supplier/barcode only ✅
- Margin, on order, last sale, sales history, recommendation ✗

---

## Capability 2 — Customers

**Goal:** Apollo understands who Proto's customers are and how they behave.

### Graduation questions (draft)

| # | Question |
|---|----------|
| 1 | Who is this customer? |
| 2 | What do they buy? |
| 3 | How has their ordering changed? |
| 4 | Are they at risk of churning? |
| 5 | What matters to them seasonally? |
| 6 | What changed since last month? |
| 7 | What changed since we last discussed them? |

---

## Capability 3 — Buying

**Goal:** Apollo understands how Proto should buy stock.

### Graduation questions (draft)

| # | Question |
|---|----------|
| 1 | What should we reorder this week? |
| 2 | How much should we order? |
| 3 | Which SKUs are overstocked? |
| 4 | Which SKUs are at risk of stockout? |
| 5 | What is the lead time impact? |
| 6 | What did we learn from the last container? |

---

## Capability 4 — Suppliers

**Goal:** Apollo understands supplier reliability and risk.

### Graduation questions (draft)

| # | Question |
|---|----------|
| 1 | How reliable is this supplier? |
| 2 | What is the true lead time? |
| 3 | What lessons do we hold about them? |
| 4 | Should we increase safety stock? |
| 5 | What hypotheses are we tracking? |

---

## Capability 5 — Money

**Goal:** Apollo understands margin, cash, and financial health.

### Graduation questions (draft)

| # | Question |
|---|----------|
| 1 | What is the margin on this product / category? |
| 2 | Where is money tied up in stock? |
| 3 | What changed in revenue this month? |
| 4 | Which products destroy margin? |

---

## Capability 6 — Proto

**Goal:** Apollo understands how Proto works — not just data, but how the business operates.

### Graduation questions (draft)

| # | Question |
|---|----------|
| 1 | How does Proto make buying decisions? |
| 2 | What principles govern discontinuations? |
| 3 | What seasonal patterns define our year? |
| 4 | What decisions have we made that still matter? |
| 5 | Does Apollo know Proto? |

This is the end state — institutional understanding, not SQL literacy.

---

## Daily Brief (education alignment)

Four questions every morning:

1. **What changed?**
2. **What matters?**
3. **What should we do?**
4. **What should we investigate?** ← Curiosity

The fourth question is **Curiosity** — Apollo occasionally asks, never autonomous:

- *"Three customers who buy Product A have stopped buying Product B. Would you like me to investigate?"*
- *"This supplier's lead time has increased for three consecutive shipments. Should I start tracking this as a hypothesis?"*

Observant, not autonomous.

---

## Next actions (frozen scope)

1. Read `docs/APOLLO_MISSION.md` — if it still reads true, commit staged docs
2. Prove live SQL (`vercel dev` → `GET /api/apollo`)
3. **Capability 1:** Apollo Integration Layer — Registry + Product Context (`docs/APOLLO_INTEGRATION_LAYER.md`)

No new architecture. No new philosophy. Start educating.
