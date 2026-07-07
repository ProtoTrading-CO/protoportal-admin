# Apollo PR3 — Business Contexts

Refactors PR2 experience logic into reusable Business Context builders under `api/intelligence/bi/contexts/`, with pure formatters in `api/intelligence/bi/format/`. No new architecture layers. No new queries.

## 1. Files created

| File | Purpose |
|------|---------|
| `api/intelligence/bi/contexts/_helpers.js` | Shared helpers (daysSince, mergeMeta, contextEnvelope) |
| `api/intelligence/bi/contexts/product.js` | Product Context builder |
| `api/intelligence/bi/contexts/customer.js` | Customer Context + Customer Alerts builder |
| `api/intelligence/bi/contexts/inventory.js` | Inventory Context builder (all list types) |
| `api/intelligence/bi/contexts/daily-brief.js` | Daily Brief Context — composes inventory + customer alerts + orders |
| `api/intelligence/bi/contexts/index.js` | Barrel export |
| `api/intelligence/bi/format/product.js` | Product markdown formatter |
| `api/intelligence/bi/format/customer.js` | Customer markdown formatter |
| `api/intelligence/bi/format/inventory.js` | Inventory markdown formatter |
| `api/intelligence/bi/format/daily-brief.js` | Daily Brief markdown formatter |
| `api/intelligence/bi/format/index.js` | Barrel export |
| `tests/intelligence/contexts.test.js` | Formatter + helper tests |

## 2. Files modified

| File | Change |
|------|--------|
| `api/intelligence/bi/facade.js` | Dispatches to context builders + formatters |
| `api/apollo.js` | Uses `buildDailyBriefContext` / `formatDailyBriefContext`; GET returns `brief.context` |

## 3. Files removed

| File | Replaced by |
|------|-------------|
| `api/intelligence/bi/morning-brief.js` | `contexts/daily-brief.js` + `format/daily-brief.js` |
| `api/intelligence/bi/product-context.js` | `contexts/product.js` + `format/product.js` |
| `api/intelligence/bi/customer-context.js` | `contexts/customer.js` + `format/customer.js` |
| `api/intelligence/bi/inventory-attention.js` | `contexts/inventory.js` + `format/inventory.js` |

## 4. Context builders created

| Builder | `type` field | Reused by |
|---------|--------------|-----------|
| `buildProductContext` | `product` | Chat, future Product workspace |
| `buildCustomerContext` | `customer` | Chat, future Customer workspace |
| `buildCustomerAlertsContext` | `customer_alerts` | Daily Brief |
| `buildInventoryContext` | `inventory` | Chat, Daily Brief, future Stock workspace |
| `buildDailyBriefContext` | `daily_brief` | Apollo home GET, chat "morning brief" |

## 5. Queries added

**None.** All contexts built from PR2 queries only.

## 6. Queries intentionally deferred

Unchanged from PR2 — analytics RPCs, ERP search, full catalogue scan.

## 7. How Daily Brief changed

- **Before:** `morning-brief.js` called queries directly and embedded business rules + markdown.
- **After:** `buildDailyBriefContext` composes `buildInventoryContext` + `buildCustomerAlertsContext` + order/listing queries. Business meaning lives in context builders; `formatDailyBriefContext` only renders.
- GET `/api/apollo` returns `brief.context` (structured) + `brief.markdown` (display).

## 8. How Product Lookup changed

- Returns structured `type: "product"` context with nested `erp`, `website`, `stock`, `supplier`, `status`, `notAvailable`, `meta`.
- Formatter separated; Apollo does not compute stock/supplier logic.

## 9. How Customer Lookup changed

- Returns `profile`, `contact`, `approval`, `orders` (with `daysSinceLastOrder`), `notAvailable`.
- Multi-match disambiguation preserved in context shape.

## 10. How Inventory Lists changed

- Items include `severity`, `reason`, `supplier` (when stmast_cache hit), `websiteStatus`.
- Supplier enrichment via existing `stock.stmast_cache_by_code` (top 10 per list, no new query).

## 11. Test plan

```bash
npm run test:bi
```

- `contexts.test.js` — formatter output, daysSince helper
- `experience-route.test.js` — routing unchanged
- Manual: open Apollo → brief loads; product/customer/inventory starters behave as PR2

## 12. Remaining blockers for PR4

- Apollo chat legacy path still uses `apollo-data.js` for non-context intents
- No workspace UI (Stock / Customer / Product tabs) — contexts ready but not surfaced
- No overnight Brief Builder cron — `buildDailyBriefContext` is live-computed
- Focus Today wow moment (inactive high-value customer) not implemented
- Domain read repositories still deferred
- `GET /api/bi/*` debug routes not added
