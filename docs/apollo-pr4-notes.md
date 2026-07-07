# Apollo PR4 — Today Homepage

Product UI PR. No Query Engine changes. Daily Brief context extended with UI-ready fields only.

## 1. Files created

- `src/components/ApolloToday.jsx` — renders `daily_brief` context (no business logic)

## 2. Files modified

- `src/components/ApolloPanel.jsx` — Today-first layout; chat in collapsible Ask Apollo section
- `src/index.css` — Today grid, focus cards, severity colours
- `api/intelligence/bi/contexts/daily-brief.js` — richer context for UI (why/action/severity, product & customer items)
- `api/intelligence/bi/format/daily-brief.js` — markdown includes why/do lines

## 3. Context builders

Unchanged entry point: `buildDailyBriefContext`. Extended output:

- `focusToday[]` — max 5, each with `why`, `action`, `severity`, `workspace`
- `yesterday.summary[]` — concise lines for UI
- `customerAlerts.items[]` — pending, inactive high-value, large orders
- `productAlerts.items[]` — recently updated, negative, zero stock
- `workspaces.available` / `workspaces.comingSoon`

## 4. Queries added

**None.**

## 5. Queries deferred

Unchanged from PR3.

## 6. Daily Brief change

Backend assembles UI-ready structures; React only maps `brief.context` to cards.

## 7–9. Lookup / inventory

Chat behaviour unchanged. Today page rows pre-fill Ask Apollo queries on click.

## 10. Test plan

```bash
npm run test:bi
npm run build
```

Manual: open Apollo → Today loads → Focus ≤5 cards → expand Ask Apollo → starters work.

## 11. Blockers for PR5

- Dedicated workspace routes (Customer / Product / Inventory tabs)
- Overnight Brief Builder cron
- Legacy chat intents still on `apollo-data.js`
- `/api/bi/*` debug routes
