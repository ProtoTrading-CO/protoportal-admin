# Current Apollo Capabilities

**Status:** Living scoreboard (evolves weekly)  
**Branch:** `apollo-core`  
**Updated:** 2026-07-09  
**API smoke:** Pending (`vercel dev` + `GET /api/apollo`)

Facts from the codebase. **Purpose:** `docs/APOLLO_MISSION.md` (frozen). **Curriculum:** `docs/APOLLO_CURRICULUM.md` · `docs/APOLLO_EDUCATION_PLAN.md`

---

## Apollo Curriculum — report card

*For teachers. Also visible in Admin → Apollo panel.*

| Capability | Status | Graduation |
|------------|--------|------------|
| **1.1** Live Product Truth | 🟢 | Graduated (LAN) |
| **1.1A** Intent-first Routing | 🟢 | Graduated |
| **1.2** Product Profitability | ⚪ | Not started |
| **1.3** Sales Intelligence | ⚪ | Not started |
| **1.4** Product Behaviour | ⚪ | Not started |
| **1.5** Product Judgement | ⚪ | Not started |

**Maturity:** Aware 100% · Understanding 40% · Judgement 10% · Wisdom 0%

**Sprint question:** *What business question can Apollo answer after this sprint that it couldn't answer before?*

| # | Capability | Status |
|---|------------|--------|
| 1 | Apollo understands **Products** | 1.1 engineering graduated · 1.2 blocked until bridge green |
| 2 | Apollo understands **Customers** | Not started |
| 3 | Apollo understands **Buying** | Not started |
| 4 | Apollo understands **Suppliers** | Not started |
| 5 | Apollo understands **Money** | Not started |
| 6 | Apollo understands **Proto** | Not started |

Graduation criteria per capability: `docs/APOLLO_EDUCATION_PLAN.md` · **Education record:** `docs/graduations/`

---

## Apollo Understanding Score

*Primary KPI: Understanding — does Apollo understand Proto better this week?*

**Maturity today:** Level 1 (Aware) → partial Level 2 (Understanding)  
**Vertical slice live:** Entity Registry → Product Context → Query Engine → (`erp_sql` when bridge configured, else `stmast_cache`)

---

## Product Understanding

*Business metric — not SQL coverage. Every sprint increases understanding.*

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Truth** | 45% | Evidence envelopes live; `erp_sql` when bridge configured (1.1 gate) |
| **Context** | 18% | Supplier/dept + trust fields; profitability in 1.2 |
| **Memory** | 0% | Phase B |
| **Judgement** | 8% | Registry + routing; recommendations in 1.4 |
| **Overall** | **18%** | Capability 1.1 engineering graduated 2026-07-09 |

```
Truth       █████░░░░░  45%   → 100% when bridge green
Context     ██░░░░░░░░  18%
Memory      ░░░░░░░░░░   0%
Judgement   █░░░░░░░░░   8%
────────────────────────────
Overall     ██░░░░░░░░  18%
```

**Capability 1.1:** Engineering graduated · Operational awaiting bridge · **1.2 blocked until Truth verified live**

Graduation report: `docs/graduations/1.1-live-product-truth.md`

### Product field backlog (after 1.1 gate)

| Sprint | Field / query | Status |
|--------|---------------|--------|
| 1.2 | `erp.product_margin`, cost, price history | **Blocked** — start after 1.1 operational |
| 1.3 | Last sale, sales history, stock cover, monthly, GRV | Not started |
| 1.4 | Buying recommendation | Not started |

**Still on cache when live ERP active:** supplier name, barcode (not in STMAST SELECT).

### SQL bridge (environment gate)

| Item | Status |
|------|--------|
| Query Engine | ✅ Working |
| Product Context | ✅ Working |
| Tests | ✅ 82/82 |
| Build | ✅ |
| Trust evidence on Product Context | ✅ |
| `STOCK_SQL_BRIDGE_URL` locally | ❌ Not configured — **operational gate only** |
| Verify script | `node scripts/verify-erp-product.mjs [SKU]` |

---

## Apollo Understanding Score (capabilities)

```
Products          ████░░░░░░  35%   ← Capability 1 active
Customers         ██░░░░░░░░  20%
Buying            █░░░░░░░░░  10%
Suppliers         ░░░░░░░░░░   0%
Money             ░░░░░░░░░░   0%
Apollo Memory     ░░░░░░░░░░   0%
Promotion Engine  ░░░░░░░░░░   0%
```

**Weekly question:** What new questions can Apollo answer today that it couldn't answer last Friday?

**Daily question:** Does Apollo understand Proto better today than yesterday?

---

## What Apollo is

**Understand · Remember · Advise** — read-only institutional intelligence for Proto. Primary routing is deterministic; AI is clarification and freeform fallback only. Tagline: *Know what's changed.*

**Pipeline:**

```
Natural language → Intent Engine → Business Context → Query Engine → SQL / Supabase → Evidence → Answer
```

---

## Apollo currently knows (Business Contexts)

| Context | Module | Data sources |
|---------|--------|--------------|
| Products | `api/intelligence/bi/contexts/product.js` | Stock Supabase, `stmast_cache`, ERP via `erp.product_by_code` |
| Customers | `api/intelligence/bi/contexts/customer.js` | Portal Supabase (`customers`, `orders`) |
| Inventory | `api/intelligence/bi/contexts/inventory.js` | Stock levels, negative/low/zero lists |
| Daily Brief | `api/intelligence/bi/contexts/daily-brief.js` | Aggregated alerts across domains |
| Website | Via daily brief sections | Search analytics, listings |

---

## Apollo can answer (Intent Engine — deterministic)

| Intent | Example phrasing |
|--------|------------------|
| Daily Brief | "Morning brief", "What needs my attention today?" |
| Yesterday summary | "What changed yesterday?" |
| Business health | "Business health", "How is the business doing?" |
| Website summary | Website pulse section of brief |
| Product lookup | SKU or product code in natural language |
| Customer lookup | Customer name, email, or business |
| Inventory attention | Negative stock, low stock, inventory alerts |

**Tests:** `npm run test:bi` — 45/45 on `apollo-core`.

---

## Apollo can answer (Legacy engine — still active)

Routed via `api/apollo-data.js` + `api/apollo-engine.js` when Intent Engine does not match:

| Area | Examples |
|------|----------|
| Product search | Keyword / SKU lookup |
| Customer list / pending | "Who are my customers?", pending approval |
| Orders | Order summary, top ordered items |
| Search analytics | Top searches, zero-result terms, search→order |
| Stock lists | Negative, low, high stock by category |
| Charts | Bar charts in markdown when requested |
| Greeting | Hard-coded welcome |
| Freeform | OpenRouter fallback with trimmed live-data context |

---

## Registered Query Engine queries (14)

**Portal:** `portal.customer_by_id`, `portal.customers_pending`, `portal.customers_search`, `portal.orders_by_customer`, `portal.orders_recent`

**Stock:** `stock.website_stock_by_sku`, `stock.listings_since`, `stock.negative_stock_list`, `stock.low_stock_list`, `stock.zero_stock_list`, `stock.high_stock_list`, `stock.stmast_cache_by_code`, `stock.products_soh_by_skus`

**ERP:** `erp.product_by_code` (SQL adapter → `_sql-provider` → bridge or `stmast_cache`)

---

## Apollo cannot yet answer

| Gap | Education capability |
|-----|---------------------|
| Deep SKU knowledge (supplier, margin, history per SKU) | Capability 1 — Products |
| Customer behaviour / segments / churn | Capability 2 — Customers |
| Buying forecasts / purchase recommendations | Capability 3 — Buying |
| Supplier recommendations / lead-time risk | Capability 4 — Suppliers |
| Margin analysis / cashflow | Capability 5 — Money |
| Full Proto operational understanding | Capability 6 — Proto |
| `searchProducts()` / `getSupplierProducts()` SQL search | Capability 1 — implementation |
| Department / supplier clarify routes | Capability 4 — implementation |

---

## Infrastructure

| Item | Status |
|------|--------|
| Development branch | `apollo-core` (long-lived) |
| Production branch | `main` |
| Unit tests | 45/45 pass |
| Production build | Pass |
| Live API smoke | **Pending** — `vercel login` → `vercel dev` → `GET /api/apollo` |
| PR to `main` | Not merged — Intelligence not yet in production |

---

## Six pillars — implementation status

| Pillar | Status on `apollo-core` |
|--------|-------------------------|
| 1. Truth | **Live** — Query Engine, 14 queries, read-guard |
| 2. Context | **Partial** — Business Contexts; semantic rules = Capability 1–3 |
| 3. Memory | **Not built** — Phase B (Apollo Memory; business events, not chat) |
| 4. Reasoning | **Partial** — Intent Engine + brief; needs Memory |
| 5. Learning | **Not built** — Phase C (outcome-based) |
| 6. Trust | **Partial** — read-only + envelope; full explainability UI ongoing |

## Primary KPI: Understanding

Did Apollo's understanding of Proto increase this week? Supporting metrics: truth coverage, promotion commits, trust field completeness, outcome linkage.

**Maturity levels:** 1 Aware · 2 Understanding · 3 Judgement · 4 Wisdom — see `docs/APOLLO_MISSION.md`.
