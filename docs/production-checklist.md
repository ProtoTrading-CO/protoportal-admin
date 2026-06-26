# Production readiness checklist

Last run: 2026-06-25 (production hardening branch).

## Build

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Clean build |

## Environment (Vercel `protoportal-admin`)

See `scripts/env.example` for the full list. Required for production:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_STOCK_SUPABASE_URL`, `VITE_STOCK_SUPABASE_KEY`
- `OPENROUTER_API_KEY`
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`
- `CRON_SECRET` (Vercel cron auth)
- `ORDER_NOTIFY_SECRET` (fulfillment order links)

Optional: `ADMIN_DASH_KEY`, `IMAGE_GEN_CONCURRENCY`, R2 vars, OpenRouter model overrides.

## Auth

- **Client:** Supabase email/password login; allowlist in `src/lib/auth.js` (3 admin emails).
- **API:** `requireAdminKey` validates JWT or `x-admin-key`; fulfillment routes accept order tokens.
- **Cron:** `requireCronOrAdminKey` checks `CRON_SECRET`.

## Crons (`vercel.json`)

| Path | Schedule | Notes |
|------|----------|-------|
| `/api/run-scheduled-broadcasts` | hourly | WhatsApp broadcasts |
| `/api/brevo-sync` | every 15 min | CRM contact cache |
| `/api/purge-expired-staging` | 03:00 daily | Staged image cleanup |

All use `requireCronOrAdminKey` — failures return JSON `{ error }` without crashing the platform.

## Database migrations (manual)

Run on **stock Supabase** (`yiqsvwajozafvalwcero`):

- `migrations/032_disable_auto_oos.sql` — disable auto-OOS archive
- Then: `node scripts/restore-auto-oos-to-live.mjs` — bulk restore legacy `auto-oos` rows

## PII

`data/proto-active-customers.json` — intentional seed data for Proto Active customers panel (~40k lines). Not customer-facing.

## Post-deploy smoke

- [ ] Admin login (allowlisted email)
- [ ] Product Manager: archive / make live
- [ ] Fulfillment: Victor gate on save + send
- [ ] Order confirmation email (no prices on customer copy)
- [ ] Apollo index rebuild
- [ ] Mobile: Admin + Fulfillment layouts
