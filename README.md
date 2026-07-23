# CleanOps

Full plan: [PLAN.md](./PLAN.md). Deviations from the plan: [DECISIONS.md](./DECISIONS.md).
**Current status and open items: [HANDOFF.md](./HANDOFF.md) — read this first.**

## Current beta status

CleanOps v1 is a functional internal operations beta, live on Vercel, with real customer/job
data imported (692 jobs, 209 recurring series backfilled from TheCustomerFactor):

- Dashboard KPIs, schedule, revenue, overdue invoices, attention queues, and inventory snapshot
- Customer profiles with upcoming jobs, house instructions, locations, and invoice history
- Redesigned Jobs (Active/Pending/History tabs, pagination, audit history, manual time entry)
  and Calendar (staff/day/week/month dispatch views, drag-to-reassign, undo)
- Quote builder, live seven-tier pricing, public proposal acceptance, and recurring-series conversion
- Invoice records, check/cash payments, tips, discounts, and print/PDF support — **Square
  payment collection is still in mock mode in production; see HANDOFF.md before assuming
  invoices are real**
- Friday-morning payroll periods, employee detail, Job Ticket Hours calculations, manual adjustments, audit logs, and Gusto CSV export
- GHL workflow tag mapping, inbound/outbound sync boundaries, retry logs, and webhook replay protection
- Responsive CleanOps frontend matching the approved evergreen/cream operations-desk mockups
- Sentry error monitoring wired in production

The beta is intended for internal operations/pilot use. Employees do not need to use the app; an admin can enter job hours on their behalf. See [HANDOFF.md](./HANDOFF.md) for what's
blocked, what's still open, and what not to touch mid-flight (Codex works this repo in
parallel).

Run the authenticated read-only smoke test against a running local app with:

```text
npm run smoke:auth
```

Set `SMOKE_BASE_URL`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` when using credentials other than the local seed account.

## Local setup

The hosted Supabase project and Vercel deployment already exist — this is for running the
app locally against them, not first-time provisioning.

1. Create `.env.local` with the Supabase/DB values — pull them with `vercel env pull
   .env.local` if you're linked to the Vercel project, or ask for access to the Supabase
   project directly. There's no `.env.local.example` checked in; `scripts/check-env.mjs`
   lists every variable it expects (required + integration-optional).
2. `npm install`
3. `npm run check:env` to confirm required variables are present.
4. `npm run dev`, log in at `/login`.

For demo/local-only data instead of the real hosted DB, use `npm run db:seed` against a
local Supabase stack (see `SUPABASE.md`) — never against production.

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

## What's next

All of PLAN.md §7's build phases are complete. Remaining work is pilot-launch prep — see
[HANDOFF.md](./HANDOFF.md) for the current blocked/open item list.
