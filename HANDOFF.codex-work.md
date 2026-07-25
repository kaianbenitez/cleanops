# CleanOps beta-prep handoff

Continuing CleanOps beta-prep work. Status as of July 23, 2026:

## Done

- Sentry DSN added to Vercel env vars (`SENTRY_DSN`); code is already wired in `src/instrumentation.ts`.
- 209 recurring series and 692 jobs backfilled from the old TheCustomerFactor CSV export.
- Vercel deployment confirmed live and matching the latest commit.
- New GitHub repo `kaianbenitez/cleanops-backup` created with a daily backup GitHub Action (`.github/workflows/backup.yml`). It dumps the database nightly at 9am UTC, uploads the dump as a GitHub Release, and prunes releases older than 30 days.
- Jobs list and job detail redesign implemented in the shared `cleanops-codex` repo:
  - Jobs list now has Active, Pending, and History tabs, 25-row pagination, date-range controls, filters, operational metrics, and clickable rows.
  - Pending means active (`scheduled`/`in_progress`) jobs without assignments.
  - History includes `completed`, `cancelled`, and `no_show` jobs.
  - Job detail now shows customer email/phone, duration, invoice/quote data, assignment, scheduling, price, notes, audit history, and manual time entry.
  - Checklist and fake route/timeline UI were removed.
  - Existing PATCH, PTO/conflict validation, invoice, time-entry, payroll refresh, and audit workflows were preserved.
  - Verified with `npm run lint`, `npm run typecheck`, `npm run build`, and browser checks at desktop/mobile widths.

## In progress / blocked

- Backup workflow is failing: Supabase's direct connection (port 5432) is IPv6-only and GitHub Actions runners cannot reach it (`Network is unreachable`). Fix: in Supabase dashboard → Project Settings → Database → Connection string, switch to Session pooler mode (IPv4-compatible and usable with `pg_dump`), update the `BACKUP_DATABASE_URL` secret in the `cleanops-backup` repo, then re-run the workflow manually from the Actions tab.
- Codex is actively redesigning the Calendar/Schedule UI (staff/daily/weekly/monthly views, full-bleed layout, and overflow handling for high-volume days) based on the four reference mockups.
- Two small logic bugs remain assigned to Claude: calendar `page.tsx` “Unassigned” stat card queries the wrong unfiltered month-wide dataset; `assignDayLanes()` in `calendar/shared.ts` has no overflow cap for high-volume days. Check whether the Calendar redesign resolves these before duplicating work.

## Still open

- Decide whether to delete test/demo accounts: QA Tester, Test Cleaner, and Maria Gomez.
- Create real pilot cleaner accounts; only admin/test accounts exist currently.
- Configure payroll tier rates.
- Test the My Day workflow on an actual phone.
- Confirm whether these are needed for pilot launch: `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Run `npm run smoke:routes` against a local production build for this cycle.
- Decide whether to commit/push the current uncommitted Calendar and Jobs changes after review.

## Parallel-work note

Codex works on this same repo in parallel and can commit/push directly mid-session. If `git status` shows an unexpected mid-merge state, do not touch it destructively; use `git fetch` and check `origin/main` and the latest Vercel deployment first.
