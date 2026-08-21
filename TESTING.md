# Testing CleanOps locally

How to actually exercise a change before calling it done, and the specific traps
that have cost real time. Stable working rules live in `AGENTS.md`; this file is
only about running and verifying things.

## One-time setup (needs a human, once per machine)

1. **Add browser-test credentials to `.env.local`** (that file is gitignored):

   ```
   BROWSER_ADMIN_USERNAME=<admin username>
   BROWSER_ADMIN_PASSWORD=<that account's password>
   ```

   Without these, every authenticated Playwright spec calls `test.skip(...)` and
   the run still prints **green**. Verified 2026-07-27: `npx playwright test`
   reported `3 passed` while silently skipping the only logged-in test — which,
   once actually run, failed on three separate stale selectors that had drifted
   during UI redesigns. A skipped test is not a passing test.

   `tests/browser/hybrid-access.spec.ts` additionally reads:

   ```
   BROWSER_HYBRID_USERNAME=<username of an admin account with isFieldStaff=true>
   BROWSER_HYBRID_PASSWORD=<that account's password>
   ```

   `BROWSER_ADMIN_USERNAME` itself is assumed **not** field staff for that
   spec's "office-only admin bounced off /my-day" case — repoint it at a
   genuinely office-only account if that assumption stops holding.

2. **Install the Claude Chrome extension** if you want an agent to drive a real
   browser — see [Chrome](#chrome-claude-in-chrome) below. Nothing else in this
   file depends on it.

> `scripts/smoke-test.mjs` currently hardcodes a fallback admin username and
> password as defaults, and those defaults authenticate against the **hosted
> Supabase project**. That is why `npm run smoke:auth` works with no setup. It
> should be moved to env-only — treat it as a known issue, not a feature.

## Every session

```bash
npm run verify                                    # env + lint + typecheck + build
npx next start -p 3120                            # pick a FREE port — see Ports below
npm run smoke:routes -- http://localhost:3120
npm run smoke:auth   -- http://localhost:3120
BROWSER_BASE_URL=http://localhost:3120 npm run test:browser
```

Add `npm run check:drift` first for anything schema-dependent (`AGENTS.md` has
the reasoning — a committed migration file is not evidence it was applied).

## What each check actually proves

| Command | Covers | Does **not** cover |
| --- | --- | --- |
| `npm run verify` | env vars present, lint, types, production build compiles | nothing at runtime |
| `npm run smoke:routes` | 5 routes, signed out: `/login`, a bad quote token, and 3 redirect-to-login checks | every authenticated page |
| `npm run smoke:auth` | 22 checks — logs in, then fetches the main pages and APIs and asserts a marker in each | interaction; it only reads HTML |
| `npm run test:browser` | real Chromium: login page, signed-out redirects, public proposal, one admin employee flow, hybrid admin+field-staff `/my-day` access (needs `BROWSER_HYBRID_USERNAME`/`PASSWORD`) | any page not in `tests/browser/` |

None of these cover a page you just changed unless you add a spec. `smoke:auth`
is the highest-value one and is **not** in the `AGENTS.md` release sequence —
run it anyway.

## Ports — the single biggest time sink

`3100` is Playwright's default and is frequently already occupied by a stale
server from an earlier session or from Codex. Two failure modes:

- `npx next start -p 3100` dies with `EADDRINUSE`.
- Worse, Playwright's `reuseExistingServer` **silently attaches** to whatever is
  on that port. A green run can mean you tested someone else's build.

Check what is listening before you start (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { "$($_.LocalPort) -> PID $($_.OwningProcess)" }
```

`playwright.config.ts` now avoids the trap: **set `BROWSER_BASE_URL` and
Playwright starts no server at all**, using yours. Use `BROWSER_PORT` if you do
want it to start one on a non-default port.

Clean up servers you started. `TaskStop` on a backgrounded `npx next start`
kills the npm wrapper but can leave the Next child listening — confirm the port
is released, and `Stop-Process -Id <pid> -Force` if not. Only kill PIDs you
started; another session may be using 3100 deliberately.

## Chrome (claude-in-chrome)

Connected and working as of 2026-07-27. If a session reports "Browser extension
is not connected": install from <https://claude.ai/chrome>, sign into claude.ai
in Chrome with the **same account** as Claude Code, restart Chrome, and grant the
extension site permission for `localhost` (it is permissioned per site). Verify
with `tabs_context_mcp` before assuming it works; if it errors twice, fall back
to Playwright rather than retrying.

**An agent cannot log you in.** Typing a password into a field is off-limits, so
the flow is:

1. The agent starts a server and opens the page; protected routes bounce to
   `/login`.
2. **You sign in manually in that tab**, once.
3. The agent drives everything after that — the Chrome profile keeps the session,
   so later sessions usually land already authenticated.

Do not click controls guarded by `window.confirm` (e.g. "Delete permanently" on
the employee profile) from an agent session — a browser dialog blocks the
extension until it is dismissed by hand.

Batch coordinates go stale within a batch. `browser_batch` resolves every
coordinate against the screenshot taken *before* the call, but closing a
search-picker dropdown reflows the page by 100px or more. Re-screenshot between
a click that closes an overlay and the next click, rather than batching through
it.

Use Chrome for "show me what this looks like" and for one-off exploration. For
anything you want to re-run or assert on, write a Playwright spec instead — it
does not need your browser open and it fails loudly.

## Writing a throwaway check script

- **Put it in the repo root, not the scratchpad.** Node resolves `node_modules`
  relative to the *script's* directory, so a script in the scratchpad fails with
  `ERR_MODULE_NOT_FOUND` on `dotenv`/`@supabase/ssr`. Write it to the repo root,
  run it, delete it.
- **Python is not installed** (`python` hits the Windows Store stub). Use Node.
- **The Bash tool is Git Bash, not PowerShell.** A PowerShell here-string
  (`@'...'@`) is not syntax there — it leaks a literal `@` into whatever you are
  writing. Use `<<'EOF'` heredocs in Bash; use `@'...'@` only in the PowerShell
  tool.
- Prefer a temporary `tests/browser/.tmp-*.spec.ts` over ad-hoc fetch scripts
  when checking interaction; delete it after unless it is worth keeping.

## Repo-specific selector gotchas

Learned the hard way while testing `/recurring/new`:

- `page.locator("aside")` matches the **app nav sidebar** as well as a page's
  summary panel. Scope it: `page.locator("form aside")`.
- Search-picker dropdowns render as `div.absolute button`. A bare
  `page.locator("button")` matches hidden nav buttons first.
- Forms mix native and JS validation. A `required` `<input type="date">` blocks
  submit in the browser, so the JS error message never renders. Fill the native
  required fields first if the JS validation path is what you are testing.
- **Several pages are still client components that fetch on mount**, so their
  content appears long after navigation. `/employees/[employeeId]` is the worst
  (695 lines, `useEffect` + `fetch`) and needs `toBeVisible({ timeout: 20_000 })`
  on the first assertion after you land on it. If an assertion fails against a
  screenshot showing a loading skeleton, it is this — not a missing feature.
- **Control labels drift from their descriptions.** The employee archive toggle
  is a button labelled just `Archive` / `Restore` in the profile header, while
  the Account access card contains the *text* "Archive employee" as a
  description. Assert on the control, and check the source before concluding a
  control is missing.
- `window.confirm` guards "Delete permanently" on the employee profile. Browser
  dialogs freeze the Claude Chrome extension — do not click it from an agent
  session.
- **`getByRole("alert")` never returns zero matches.** Next renders its own
  always-present route announcer with `role="alert"`, so asserting
  `toHaveCount(0)` on a page's error banner fails even when no banner is shown.
  Filter to your own element: `getByRole("alert").filter({ hasText: /…/ })`.

## My Day

Most of My Day's logic (`src/lib/my-day/workday-state.ts`, `job-completion.ts`,
`close-out.ts`) is pure and unit-tested directly — run `npm run test:my-day`
for just that suite, or `npm run test:unit` for everything. Prefer adding a
unit test there over a browser spec; reach for Playwright only when rendering
itself is the thing under test.

- **`BROWSER_ADMIN_USERNAME` is not reliably a hybrid.** The WP-F packet
  assumed that account (`kaianbenitez`) was `role: admin, isFieldStaff: true`.
  Verified directly against the database on 2026-08-20: it is
  `isFieldStaff: false` — a genuinely office-only admin, correctly bounced off
  `/my-day` to `/dashboard`. **Use `BROWSER_HYBRID_USERNAME`/`PASSWORD` for
  any My Day browser spec** — verified the same way to be a real hybrid
  (`brittneyriggs`, `role: admin, isFieldStaff: true`). This can drift again;
  re-check with a one-off query before trusting either account's role for a
  new spec:
  ```
  env -u DATABASE_URL npx tsx -e '
  import { db } from "./src/db";
  import { users } from "./src/db/schema";
  import { eq } from "drizzle-orm";
  db.select({ role: users.role, isFieldStaff: users.isFieldStaff })
    .from(users).where(eq(users.email, "<username>@cleanops.local")).limit(1)
    .then((r) => { console.log(r); process.exit(0); });
  '
  ```
- **`tests/browser/my-day-field.spec.ts` is read-only on purpose.** This
  session's `DATABASE_URL` resolves to the *hosted* Supabase project, so any
  authenticated My Day spec here runs against real production data through a
  real account. Never click a primary action or submit a close-out form from
  a spec that might run against the hosted DB — that mutates a real
  employee's real day. Assertions that require an actual state transition
  (aria-live text changing, a receipt after a real clock-out) need
  `scripts/seed-field-test.ts` fixtures against a **local** Supabase instance
  instead (`npm run supabase:start`, point `DATABASE_URL` at it, confirm the
  script prints "target host is local" before it writes anything).
- **Magic-link auth rate-limits fast.** Supabase Auth throttles
  `auth.admin.generateLink({ type: "magiclink" })` for the same email in quick
  succession — re-authenticating in every test's own `beforeEach` (as
  `hybrid-access.spec.ts` does, fine for 2 tests) hit "Email link is invalid
  or has expired" partway through an 8-test file. For more than a couple of
  authenticated tests in one file, authenticate once in `test.beforeAll`,
  cache the resulting cookies, and `context.addCookies(...)` them into each
  test — and add `test.describe.configure({ mode: "serial" })`, since
  `beforeAll` runs once *per worker*, not once per file, so parallel workers
  will otherwise each fire their own login and collide with the same limit.
- `scripts/seed-field-test.ts` is idempotent and local-only — it refuses to
  run (checks the `DATABASE_URL` host) against anything but `localhost` /
  `127.0.0.1`. Run it with `npx tsx scripts/seed-field-test.ts` after
  `npm run supabase:start`; it prints the usernames and a shared password for
  the three accounts it creates or reuses.

## Never do this

- **Do not submit a form that writes to the hosted database.** There is no local
  DB in this workflow — `POST /api/recurring-series` creates a real series plus
  at least 3 months of jobs. Assert on validation failures instead, or read-only paths.
- Do not run `npm run db:migrate`, `db:push`, or `supabase:reset` (see
  `AGENTS.md`).
- Do not commit `test-results/`, `playwright-report/`, or root `*.log` files —
  all three are gitignored, but never force-add them.
