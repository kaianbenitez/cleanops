<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shimmer working rules

These are process rules for daily work. Blanket invariants that apply to every task
regardless of what you're doing (auth scoping, secrets, migration safety, product naming)
live once in the Invariants section of `AI-CONTEXT.md` — don't restate them here.

- Run `npm run verify` before presenting a change as ready.
- Run `npm run smoke:routes` when a local production server is available.
- **Read `TESTING.md` before running any browser/smoke check.** It covers the port-collision
  trap (Playwright silently reuses a stale server on 3100), why authenticated browser specs
  skip silently and still report green, Chrome-extension setup, and the selector/scripting
  gotchas specific to this repo. `npm run smoke:auth -- <baseUrl>` is the highest-value
  runtime check and is not in the release sequence below — run it anyway.
- By user preference, always commit and push each completed, verified feature before handoff.
- Explain completed work in the simplest possible language for a non-code developer: lead with what changed and what it means, keep reports short, avoid jargon, and clearly call out anything unfinished or blocked.
  Before staging, inspect `git status` and the per-file diff. If unrelated/shared changes are
  present, stage only the completed feature's explicit paths; do not include them in the commit.
  Stop only for a merge state or an unapproved production migration. Never use `git add -A` or
  `git add .` in this shared worktree.
- GHL checks must use the approved test location and read-only requests unless the user explicitly asks for a write test.
- For quote changes, verify both the internal quote builder and the unauthenticated public proposal.
- For My Day changes, verify mobile one-handed use, travel/clock-in/break/finish state, undo behavior, and server refresh ordering.
- Do not stage `.claude/settings.local.json`, `.codex/`, or other local tool state unless explicitly requested.
- Whenever a fix or feature ships, add a plain-language entry to the in-app Help Center
  changelog (`RELEASES` array in `src/app/(app)/help-center/page.tsx`) in the same handoff as
  the code change — not just an update to `HANDOFF.md`. Bump the version and add a new dated
  entry rather than editing a past release's list.

## Common release sequence

1. `npm run check:env`
2. `npm run check:drift` — fails if the hosted DB is missing anything `src/db/schema.ts`
   expects. A committed migration file is **not** evidence it was applied here; this is the
   only reliable check. See Supabase safety below.
3. `npm run verify`
4. Start the built app with `npx next start -p 3100` — **check the port is free first**;
   a stale server there is common. Any free port works, see `TESTING.md`.
5. In another terminal, run `npm run smoke:routes -- http://localhost:3100`
   and `npm run smoke:auth -- http://localhost:3100`.
6. Confirm the Vercel deployment commit matches `git rev-parse HEAD`.

## Supabase safety

- Use `npm run supabase:status` to inspect the local CLI stack.
- Local Supabase requires Docker Desktop.
- The hosted database is managed through Drizzle migrations in this project.
- Never run `npm run supabase:reset`, `db push`, or production migrations without explicit approval.
- **Migrations here are applied by hand, so a committed `drizzle/*.sql` file does not mean it
  reached the hosted DB.** This has bitten the project three times (0008–0010, then 0011,
  then 0013–0014), each time shipping UI against columns that did not exist live. Run
  `npm run check:drift` before shipping anything schema-dependent and after applying any
  migration.
- `npm run db:migrate` is deliberately disabled (it cannot work against this database and
  only wastes a session's time rediscovering that). To apply a migration, run its SQL
  directly in a single transaction after getting approval, then re-run `check:drift`.
- `.github/workflows/schema-drift.yml` runs `check:drift` on every push to `main`, daily, and
  on demand. It does **not** run on pull requests: adding a migration before applying it is
  the normal workflow, so a PR check would fail on exactly the PRs doing it right. A red
  Schema drift run means code on `main` is probably erroring in production — treat it as
  urgent, not as a flaky check.
