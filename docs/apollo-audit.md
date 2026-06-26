# Apollo audit — representative queries

Audit date: 2026-06-25. Index rebuilt via `GET /api/apollo?refresh=1`.

| # | Query | Expected intent | Pass |
|---|-------|-----------------|------|
| 1 | How many products are live? | `product_count` | pass |
| 2 | Which products have negative stock? | `product_negative_stock` | pass |
| 3 | Show low stock items | `product_low_stock` | pass |
| 4 | Find code 8610100001 | `product_search` (SKU) | pass |
| 5 | Orders this week | `order_summary` | pass |
| 6 | Top ordered items | `order_top_items` | pass |
| 7 | Top searches this month | `search_top` | pass |
| 8 | Zero result searches | `search_zero` | pass |
| 9 | List customers | `customer_list` | pass |
| 10 | Find customer Plushprops | `customer_search` | pass |
| 11 | Pending approval products | `product_pending` | pass |
| 12 | Create a report of best sellers from Positill | `positill_report` / freeform | pass |
| 13 | Positill report on 101 findings | `positill_report` | pass |
| 14 | `/image` | image wizard (client) | pass |
| 15 | hi | `greeting` | pass |

## Hardening applied

- **Rebuild index** button in Apollo panel (`?refresh=1`) with `indexedAt` label.
- API errors surfaced in panel header + composer (no stuck spinner).
- `validateIntent` rejects SKU lookups when extracted code missing from terms.
- `fix` / `badReply` retry loop unchanged in `api/apollo.js`.

## Manual re-check

```bash
# Requires admin session / ADMIN_DASH_KEY in env for local curl
curl -s "$ADMIN_URL/api/apollo?refresh=1" -H "Authorization: Bearer $TOKEN"
```

Run representative questions in the Apollo UI after deploy; confirm `source: live-index` for data questions.
