# CleanOps

Full plan: [PLAN.md](./PLAN.md). Deviations from the plan: [DECISIONS.md](./DECISIONS.md).

## Current beta status

CleanOps v1 is now a functional internal operations beta with:

- Dashboard KPIs, schedule, revenue, overdue invoices, attention queues, and inventory snapshot
- Customer profiles with upcoming jobs, house instructions, locations, and invoice history
- Manual scheduling, assignment, job detail, checklists, time entry editing, and audit history
- Quote builder, live seven-tier pricing, public proposal acceptance, and recurring-series conversion
- Invoice records, mocked/sandbox-safe Square flow, check/cash payments, tips, discounts, and print/PDF support
- Friday-morning payroll periods, employee detail, Job Ticket Hours calculations, manual adjustments, audit logs, and Gusto CSV export
- GHL workflow tag mapping, inbound/outbound sync boundaries, retry logs, and webhook replay protection
- Responsive CleanOps frontend matching the approved evergreen/cream operations-desk mockups

The beta is intended for internal operations use first. Employees do not need to use the app; an admin can enter job hours on their behalf.

Run the authenticated read-only smoke test against a running local app with:

```text
npm run smoke:auth
```

Set `SMOKE_BASE_URL`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` when using credentials other than the local seed account.

## Phase 0 status (scaffold)

Done, typecheck + lint clean:
- Next.js (App Router, TS, Tailwind v4) project scaffolded
- Full Drizzle schema for every table in PLAN.md §4 (`src/db/schema.ts`)
- Drizzle + postgres-js client (`src/db/index.ts`), `drizzle.config.ts`
- Supabase auth wiring: browser/server clients, session-refresh middleware,
  `getCurrentUser` / `requireAdmin` / `requireUser` helpers
- Login page, role-aware app shell (`(app)/layout.tsx`), admin Dashboard,
  employee "My Day" view with clock-in/clock-out API routes
- Seed script with realistic demo data (1 company, 4 users, 3 services,
  10 customers across every pipeline status, 2 recurring series, ~2 weeks of jobs)

**Not yet runnable end-to-end** — needs real credentials, which only you can provide:

## What you need to do next

1. **Create a Supabase project** (supabase.com, free tier).
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     (Project Settings → API)
   - `DATABASE_URL` (Project Settings → Database → Connection string, use the
     **Transaction pooler** URI)
3. Push the schema: `npm run db:push` (creates all tables from `src/db/schema.ts`).
4. Create 4 Supabase auth users (Dashboard → Authentication → Users → Add user):
   one admin + three employees, any emails/passwords you like.
5. Run `npm run db:seed`, then in the Supabase SQL editor update the seeded
   `users.id` values to match the real auth user ids you just created
   (the seed script prints placeholder ids — swap them, or copy each real
   auth uid into the matching `users` row).
6. `npm run dev`, log in at `/login` with one of the accounts.

## Commands

```
npm run dev          # local dev server
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run smoke:auth   # authenticated read-only beta smoke test
npm run db:push      # push schema to DATABASE_URL (dev-friendly, no migration files)
npm run db:generate  # generate SQL migration files (use once schema stabilizes)
npm run db:migrate   # apply generated migrations
npm run db:studio    # Drizzle Studio — browse data in a GUI
npm run db:seed      # insert demo data
```

## Next phase

Phase 1 — Jobs & scheduling (calendar UI, job CRUD, recurring-series generation cron).
See PLAN.md §7.
