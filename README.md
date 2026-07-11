# Proto Admin Portal

Standalone admin application for [Proto Trading](https://proto.co.za). Production: **admin.proto.co.za**

This repository hosts the admin dashboard and **Apollo** — Proto Trading's Operational Brain.

---

## Apollo

Apollo exists to help Proto operate better — not to replace human judgement.

| | |
| --- | --- |
| **Where Apollo is today** | [STATUS.md](./STATUS.md) |
| **Governing principles** | [docs/APOLLO_CONSTITUTION.md](./docs/APOLLO_CONSTITUTION.md) |
| **Why it exists** | [docs/APOLLO_MISSION.md](./docs/APOLLO_MISSION.md) |
| **How it's built** | [docs/APOLLO_ARCHITECTURE.md](./docs/APOLLO_ARCHITECTURE.md) |
| **How Proto interprets the business** | [docs/PROTO_RULEBOOK.md](./docs/PROTO_RULEBOOK.md) |

**Current mission:** Earn the Knowledge responsibility.

**Guiding question:** What operational responsibility did Apollo earn this month?

---

## Development

```bash
npm install
npm run dev
npm run build
```

Stack: Vite + React, Supabase, Vercel serverless `api/`.

See [CLAUDE.md](./CLAUDE.md) for admin portal sections, auth, and conventions.
