# Apollo PR4 — Executive Morning Brief

## Product vision

Apollo opens to a **Today** executive briefing — not chat-first. Chat is section **6. Ask Apollo** (collapsed by default).

## 1. Files changed

| File | Change |
|------|--------|
| `src/components/ApolloToday.jsx` | Six-section executive brief layout |
| `src/components/ApolloPanel.jsx` | User name for summary; section 6 chat |
| `src/lib/apolloTodayPresentation.js` | **New** — presentation-only summary & dedup helpers |
| `src/index.css` | Executive brief typography, 5-col grids, severity colours |
| `tests/apollo-today-presentation.test.js` | **New** — presentation unit tests |
| `docs/apollo-pr4-preview.html` | Static layout preview (open in browser) |

**No backend changes** — reuses `buildDailyBriefContext()` as-is.

## 2. UI layout (top → bottom)

```
[Date · Executive morning brief · Live · Refresh]

1. EXECUTIVE SUMMARY
   Good morning Gee.
   Proto is healthy overall, but 3 important issues need your attention.
   3+ products with negative stock, Acme has gone quiet, …

2. FOCUS TODAY — max 5 hero cards (What / Why / Do + View all)

3. BUSINESS HEALTH — Sales · Customers · Inventory · Website · CRM

4. SINCE YESTERDAY — compact operational lines

5. OPERATIONAL — Inventory · Customers · Products · Orders · Website
   (deduped vs Focus Today)

6. ASK APOLLO — collapsible chat (ApolloPanel)
```

## 3. Components

| Component | Role |
|-----------|------|
| `ApolloToday` | Renders `brief.context` — six sections |
| `ApolloPanel` | Shell, refresh, chat, passes `userName` |
| `apolloTodayPresentation.js` | Executive summary prose, CRM pulse, ops dedup |

## 4. Context fields consumed

| Field | Section |
|-------|---------|
| `focusToday[]` | Executive summary + Focus today |
| `businessHealth[]` | Business health (+ CRM derived in presentation) |
| `whatChangedSinceYesterday[]` | Since yesterday |
| `inventoryAlerts` | Operational → Inventory |
| `customerAlerts.items` | Operational → Customers + CRM pulse |
| `productAlerts.items` | Operational → Products |
| `orderAlerts.needingReview` | Operational → Orders |
| `yesterday.listingsUpdated` | Operational → Website |
| `meta.*` | Freshness bar |

## 5. Screenshots

Open `docs/apollo-pr4-preview.html` in a browser for a static visual of the layout (sample data). Live screenshots require deploy + admin login.

## 6. UX principles applied

- Readable in ~90 seconds; desktop fits without scroll where possible
- Severity: red / amber / green / grey / blue (opportunity)
- No charts; calm whitespace; Linear/Stripe-style clarity
- Focus Today is the hero; chat is follow-up

## 7. Tests

```bash
npm run test:bi
npm run build
```

## 8. Blockers before PR5

- Workspace tab routes (Customers, Products, Inventory, Buying, Suppliers)
- True CRM/WhatsApp pulse (needs query or context field)
- Weekly sales average in executive summary (needs query)
- Overnight Brief cron
- Legacy chat intents on `apollo-data.js`
- ERP-only product alerts
- `/api/bi/*` debug routes
