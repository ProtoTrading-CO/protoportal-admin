# Proto Admin Portal

Standalone admin app for Proto Trading. **Not** the main trade portal.

- **Repo:** https://github.com/danieljoffeinfo-web/protoportal-admin
- **Production:** https://protoportal-admin.vercel.app
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
- `src/components/` — ReorderGrid, BroadcastCalendar, etc.
- `src/lib/` — products, taxonomy, customers, orders
- `api/` — serverless backend

## Auth
None — login removed. The dashboard is publicly accessible and the `api/`
gate functions (`requireAdminKey` / `requireAdminOrOrderToken` /
`requireCronOrAdminKey` in `api/_admin-auth.js`) always allow the request.

## Agent skill
See `.cursor/skills/protoportal-admin/SKILL.md` for full architecture.

**Never** implement admin features in protoportal-main's deprecated embedded AdminPage.
