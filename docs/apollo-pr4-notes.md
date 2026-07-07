# Apollo PR4 — Today Homepage

## 1. Files changed

| File | Change |
|------|--------|
| `src/components/ApolloToday.jsx` | Today UI — tabs, header, focus, snapshots, ops sections |
| `src/components/ApolloPanel.jsx` | Today-first layout; Ask Apollo below |
| `src/index.css` | Today styles (tabs, snapshots, severity colours) |
| `api/intelligence/bi/contexts/daily-brief.js` | `snapshots`, `workspaces.tabs`, focus `title`, website-changes focus |

## 2. UI sections added

1. **Workspace tabs** — Today active; Customers, Products, Inventory, Buying, Suppliers (coming soon)
2. **Header** — Greeting, date, brief time, freshness badge, warnings
3. **Focus today** — Max 5 hero cards (title, severity, why, next step)
4. **Snapshot cards** — Orders, listing changes, pending customers, inventory alerts
5. **Operational** — Inventory, Customers, Products (compact rows)
6. **Ask Apollo** — Collapsible chat below (in `ApolloPanel`)

## 3. Context fields used

| Field | UI use |
|-------|--------|
| `workspaces.tabs` | Tab bar |
| `focusToday[]` | Hero cards |
| `snapshots[]` | Snapshot row |
| `inventoryAlerts` | Inventory section |
| `customerAlerts.items` | Customers section |
| `productAlerts.items` | Products section |
| `quietSignals` | Footer |
| `meta.generatedAt`, `meta.partial`, `meta.warnings` | Header freshness |

## 4. Backend changes

`daily-brief.js` only — no Query Engine changes:

- `snapshots` array (derived from existing data)
- `workspaces.tabs` for future navigation
- Focus items include `title`; website listing change when ≥3 updates

## 5. Queries added

**None.**

## 6. Layout description

```
[Tabs: Today | Customers | Products | Inventory | Buying | Suppliers]
[Good morning · Tuesday 7 July 2026 · Brief 8:00 · Live ✓]

FOCUS TODAY — up to 5 cards (red/amber) with Why + Next

[4 snapshot cards: orders | listings | pending | inventory alerts]

[Inventory]  [Customers]  [Products]   ← 3 compact columns

Quiet: …

── Ask Apollo (collapsed) ──
```

Readable in ~60–90 seconds. No charts.

## 7. Test plan

```bash
npm run test:bi
npm run build
```

Manual:

1. Open Apollo → Today loads without typing
2. Focus shows ≤5 items with why/next
3. Snapshot cards reflect context counts
4. Row click → Ask Apollo pre-filled query
5. Chat still answers product/customer/inventory questions

## 8. Blockers for PR5

- Workspace routes (tabs are visual only)
- Overnight Brief cron
- Legacy chat intents on `apollo-data.js`
- ERP-only / missing-listing product alerts (needs queries)
