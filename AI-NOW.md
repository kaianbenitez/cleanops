# ServiceSpark — current working memory

Last refreshed: 2026-08-08

## Current state

- `cleanops-v1` is the integration checkout on `main`; its latest local commit is `b875313` (calendar control-panel refinement, 2026-08-07).
- The public ServiceSpark landing-page rebuild and simpler early-access form shipped on 2026-08-07. Hosted migration `0029_product_leads_optional_contact.sql` was applied and drift checked clean.
- The landing-page implementation checkout is `C:\Users\kbeni\Downloads\cleanops-landing` on `codex/servicespark-landing-page`. Treat it as a feature worktree of this same repository; sync it before assigning new work.

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

Search `HANDOFF.md` for shipped-feature detail and `DECISIONS.md` for durable architectural decisions. Do not load either whole file unless the task genuinely spans it.
