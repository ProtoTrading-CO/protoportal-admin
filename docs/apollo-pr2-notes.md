# Apollo PR2 — First Experience

Product-focused delivery on top of the Query Engine (PR1). Architecture unchanged — no new layers beyond the planned minimal `bi/` experience builders that compose registered queries.

## 1. Queries implemented (14 total)

| queryId | Experience |
|---------|------------|
| `portal.customer_by_id` | Customer Lookup (PR1) |
| `portal.customers_search` | Customer Lookup |
| `portal.customers_pending` | Morning Brief |
| `portal.orders_recent` | Morning Brief |
| `portal.orders_by_customer` | Customer Lookup |
| `stock.website_stock_by_sku` | Product Lookup (PR1) |
| `stock.listings_since` | Morning Brief |
| `stock.negative_stock_list` | Morning Brief, Inventory |
| `stock.low_stock_list` | Morning Brief, Inventory |
| `stock.zero_stock_list` | Morning Brief, Inventory |
| `stock.high_stock_list` | Inventory |
| `stock.stmast_cache_by_code` | Product Lookup (supplier) |
| `stock.products_soh_by_skus` | Product Lookup (SOH) |
| `erp.product_by_code` | Product Lookup (PR1) |

## 2. Queries deferred to PR3

| queryId | Reason |
|---------|--------|
| `erp.product_search` | Not needed for V1 four experiences |
| `stock.website_stock_search` | Product lookup uses code/SKU path |
| `stock.website_stock_catalogue` | Replaced by filtered list queries |
| `portal.customer_order_counts` | Derived from `orders_by_customer` |
| `analytics.top_searches` | Not in PR2 four experiences |
| `analytics.zero_result_searches` | Not in PR2 four experiences |
| `analytics.search_conversion` | Not in PR2 four experiences |

## 3. Morning Brief capabilities unlocked

- **What changed yesterday:** portal orders since midnight yesterday; website listing updates (`updated_at`)
- **Focus today:** ranked list — negative stock, pending customers, orders needing review, zero stock
- **Safe to ignore:** explicit quiet signals when sections are empty
- **UI:** Daily Brief card on Apollo home (GET `/api/apollo` → `brief.markdown`)

## 4. Product Context capabilities unlocked

- ERP master via `erp.product_by_code`
- Website listing via `stock.website_stock_by_sku`
- Supplier + department via `stmast_cache`
- SOH via `products` table when linked
- Image, status, price, `notAvailable` fields — no invented data
- Trigger: "Show product CODE", "Find code …"

## 5. Customer Context capabilities unlocked

- Search by name/email/business (`portal.customers_search`)
- Profile + approval status
- Recent portal orders + spend on loaded orders
- `notAvailable`: balance, margin, ERP sales, health score
- Trigger: "Find customer …", "Show customer …"

## 6. Inventory capabilities unlocked

- Negative, low (≤10), zero, high stock operational lists
- Filtered queries on `website_stock` — no full-catalogue scan
- Trigger: "negative stock", "low stock", "zero stock", "high stock", "inventory attention"

## 7. Remaining blockers before PR3

- Legacy chat path still uses `apollo-data.js` monolithic index for non-PR2 intents (orders summary, searches, top items)
- No overnight snapshot / Brief Builder cron — brief is live-computed on each open
- SOH may be null when only ERP has stock (warning `STOCK_NOT_LINKED`)
- Customer order count is limited to loaded orders, not lifetime ERP
- Focus Today wow moment (inactive high-value customer) not yet implemented
- Domain read repositories still deferred — BI calls query engine directly
