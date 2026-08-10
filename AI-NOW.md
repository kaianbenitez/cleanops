# ServiceSpark — current working memory

Last refreshed: 2026-08-10

## Current state

- This checkout's `main` is at `b77c031` ("Fix misleading 'Job completed' screen on multi-cleaner jobs"). The commits leading up to it are a My Day mobile-employee UX pass: multi-cleaner job-completion messaging, an upcoming-jobs list, rotation-reminder dedupe, button feedback/contrast/touch-target polish, and a phone-mockup screenshot fix.
- The ServiceSpark landing-page rebuild (motion-rich feature showcase, CTA/copy rework, hero swap) is merged into `main` as of commits `a743975`–`999015d`. A separate `cleanops-landing` worktree was noted in an earlier version of this file — confirm it's still active before assigning it new work; it may just be a stale reference now that the work is on `main`.
- Standing blockers and open decisions (unconfirmed `0019` migration, `auth_leaked_password_protection` off, Square invoicing still mock in prod pending client approval, GHL tag/workflow validation gap, etc.) live in `HANDOFF.md` under "Blocked / needs a human" and "Still open" — not restated here since that list moves independently of this refresh.

## Verification baseline

For a normal code change: `npm run verify`. Add `npm run check:env` and `npm run check:drift` for schema/config-sensitive work. Follow `TESTING.md` before starting a production server or claiming browser/smoke coverage; port 3100 can be stale and authenticated specs can skip without creds.

## Handoff template

Replace this section at the end of unfinished work (do not append a session diary):

```md
## Active handoff
- Goal:
- Branch/worktree:
- Changed files:
- Verified:
- Blocker or risk:
- Next action:
```

## On-demand history

See the load-order table in `AI-CONTEXT.md` for the full list of searchable history files
(`HANDOFF.md`, `DECISIONS.md`, `PLAN.md`, and the feature-specific `HANDOFF.*.md`/`UI-AUDIT.md`
files). Do not load any of them whole unless the task genuinely spans it.
