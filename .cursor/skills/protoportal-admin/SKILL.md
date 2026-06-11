---
name: protoportal-admin
description: Expert guide for the standalone Proto Admin Portal (protoportal-admin.vercel.app). Use whenever the user mentions admin portal, admin dashboard, Product Manager, Reorder Grid, New Products, dormant products, WhatsApp CRM, Banner Editor, Popup Specials, Analytics, Pricing & Returns, or any fix/feature for protoportal-admin — even if they don't say "admin" explicitly. NEVER use the deprecated embedded AdminPage in protoportal-main for admin work.
---

# Proto Admin Portal (standalone)

## Critical: two separate apps

| App | Repository | Production URL |
|-----|------------|----------------|
| **Admin portal (this skill)** | https://github.com/danieljoffeinfo-web/protoportal-admin | https://protoportal-admin.vercel.app |
| Main trade portal | https://github.com/danieljoffeinfo-web/Proto-Website- | https://protoportal-main.vercel.app |

The old embedded admin inside protoportal-main is **deprecated**. Never restore, reference, or deploy it.

## Auth status

**No real authentication yet.** `src/Root.jsx` passes a hardcoded `temporaryCustomer` with `role: 'admin'`. Logout reloads the page. Do not add auth assumptions without explicit user request.

## Workflow before changes

1. Work in the **protoportal-admin** repo (local path often `~/Desktop/Repos 🧑🏽‍💻/protoportal-admin`)
2. `git pull` and review current `AdminPage.jsx` — deployed code may differ from memory
3. Commit and push to `protoportal-admin` repo
4. Deploy only the `protoportal-admin` Vercel project — **not** protoportal-main

## Stack

- Vite + React 19 (JSX)
- Supabase (stock + auth env vars via `api/_site-config.js`)
- Vercel serverless `api/` routes
- Package manager: npm

```bash
npm run dev
npm run build
```

## Entry

- `src/main.jsx` → `src/Root.jsx`
- `Root.jsx`: `/fulfillment` → `FulfillmentPage`; else → `AdminPage` with temporary customer
- "Portal" button links to protoportal-main.vercel.app

## Admin sections (`AdminPage.jsx`)

| ID | Label |
|----|-------|
| `new-products` | New Products (dormant upload, cost tracker) |
| `products` | Product Manager |
| `specials` | This Week's Specials |
| `archive` | Archive |
| `reorder` | Reorder Grid (`ReorderGrid.jsx`) |
| `customers` | Customer Management |
| `crm` | WhatsApp |
| `banner` | Banner Editor |
| `popup-specials` | Popup Specials |
| `analytics` | Analytics |
| `pricing` | Pricing & Returns |
| `orders` | Order Requests |

Default section: `new-products` (not `products`).

## Data layer

- `src/lib/products.js` — catalogue CRUD, paging, cache
- `src/lib/taxonomyAdmin.js` + `api/taxonomy.js` — main categories
- `src/lib/fuzzySearch.js` — client search
- `src/components/ReorderGrid.jsx` — drag reorder UI
- `api/` — bulk upload, image transform, WhatsApp, orders, analytics, etc.

Taxonomy tree loaded dynamically (`taxonomyTree`), not only static JSON.

## Deploy

- Vercel project: **protoportal-admin**
- Do not deploy protoportal-main to this URL

## Common mistakes to avoid

1. Editing `protoportal-main/src/pages/AdminPage.jsx` — wrong app, fewer features, deprecated
2. Assuming login/session exists
3. Deploying main repo to admin Vercel alias
4. Using outdated mental model (embedded 6-section admin vs this 12-section app)
