# Proto Admin Portal

Standalone admin app for Proto Trading. **Not** the main trade portal.

- **Repo:** https://github.com/danieljoffeinfo-web/protoportal-admin
- **Production:** https://admin.proto.co.za (Vercel project `protoportal-admin`)
- **Main portal (separate):** https://github.com/danieljoffeinfo-web/Proto-Website-

## Stack
- Vite + React (JSX)
- Supabase via `api/_site-config.js`
- Vercel serverless `api/` routes
- npm

## Dev
```bash
npm run dev
npm run build
```

## Structure
- `src/pages/AdminPage.jsx` — all admin sections
- `src/components/` — ProductManagerEngine, ReorderGrid, etc.
- `src/lib/` — products, taxonomy, customers, orders
- `api/` — serverless backend

## Sections (nav ids)
`orders` (Order Requests) · `product-loader` · `image-replace` · `apollo`
(conversational analyst — **no image gen**) · `catalogue` (Product Manager,
live only) · `archive` (archived products, no category sidebar) · `reorder`
(Reorder Grid) · `customers` (incl. Scheduled emails + Email Analytics tabs)
· `site-content` (Featured + Specials + Banner Editor) · `crm` (WhatsApp) ·
`analytics` · `pricing` · `team` (opens fulfillment team modal).

Removed features — do NOT reintroduce: Apollo image generation, Cost
Tracking, product approval tab, reorder mode inside Product Manager,
recycle-bin buttons, product-type dropdown in the edit modal.

## Auth

Supabase email/password login with a **3-email allowlist** (`src/lib/auth.js`, mirrored in `api/_admin-auth.js`):

- `danieljoffeinfo@gmail.com`, `george@proto.co.za`, `online@proto.co.za`

`Root.jsx` shows `AdminLoginPage` until `getVerifiedSession()` + `/api/auth-check` succeed. API routes use `requireAdminKey` (JWT or optional `ADMIN_DASH_KEY` header). Fulfillment links use per-order HMAC tokens (`ORDER_NOTIFY_SECRET`). Crons require `CRON_SECRET`.

## Agent skill
See `.cursor/skills/protoportal-admin/SKILL.md` for full architecture.

**Never** implement admin features in protoportal-main's deprecated embedded AdminPage.
