# Apollo PR5 — Intent Engine

## Goal

Teach Apollo to understand **business intent** deterministically — not keyword search.

## Architecture

```
User question
    ↓
api/intelligence/intent-engine/resolve.js
    ↓ (intentId + params)
api/intelligence/bi/facade.js  biRun / biFormat
    ↓
Business Context builders (unchanged)
    ↓
Query Engine (unchanged)
```

## Intent Registry (`registry.js`)

| Intent ID | BI handler | Format |
|-----------|------------|--------|
| `daily_brief` | `brief.morning` | full brief |
| `yesterday_summary` | `brief.morning` | section: yesterday |
| `business_health` | `brief.morning` | section: business_health |
| `website_summary` | `brief.morning` | section: website |
| `product_lookup` | `product.context` | product |
| `customer_lookup` | `customer.context` | customer |
| `inventory_attention` | `inventory.attention` | inventory |

## Resolution order

1. **Entity detection** — SKU → product; customer phrasing → customer
2. **Exact phrases** — anchored registry patterns (confidence 1.0)
3. **Synonyms** — weighted patterns (confidence 0.7+)
4. **Clarify** — ambiguous terms (e.g. "Leather")
5. **null** — fall through to legacy `apollo-data.js` + LLM

No LLM in the intent engine.

## Example questions

See `tests/intelligence/intent-engine.test.js`.

## Tests

```bash
npm run test:bi
```

## Remaining gaps (before ERP / Graph expansion)

- `department` and `supplier` clarify options — no contexts yet
- Legacy intents (`order_top_items`, `search_top`, etc.) still on `apollo-data.js`
- Intent tie-break when scores equal — clarify prompt
- No conversation context / follow-up intent ("yes, the department")
- Supplier entity detection
- Taxonomy-aware department routing

## Files

| File | Role |
|------|------|
| `api/intelligence/intent-engine/registry.js` | Intent definitions |
| `api/intelligence/intent-engine/entities.js` | SKU / customer / ambiguity |
| `api/intelligence/intent-engine/resolve.js` | Main resolver |
| `api/apollo-experience.js` | Thin re-export |
| `api/apollo.js` | Wired before legacy path |
| `api/intelligence/bi/format/daily-brief.js` | Section formatters |
