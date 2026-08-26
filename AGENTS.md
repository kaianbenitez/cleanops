<!-- codex-workflow-id: viettran-edgeAI/codex_workflow -->
<!-- codex-workflow-managed-start -->
# AGENTS.md

## Project Context


## Design Principles

- Keep modules cohesive, interfaces explicit, coupling minimal, and behavior
  testable, replaceable, and reusable.
- Define proportionate acceptance and verification before implementation. Keep
  related tests cohesive; never weaken coverage, assertions, or failure
  visibility to save time or tokens.
- Preserve unrelated user work and use verified facts in durable documentation.

Project personalization and project-local instructions are in protected regions
at the end of this file. They override conflicting workflow defaults, but not
higher-level instructions.

## Working State

- `deployment state`: planning or executing a broad, possibly multi-session
  deployment plan.
- `leaf state`: work outside that plan, including general questions and small,
  bounded edits or operations.

## Project Documentation

The durable project documents are under `agent_docs/`:

- `project_overview.md`: goals, architecture, workflow, and major decisions.
- `project_core_tech.md`: concise special technology or architecture notes.
- `project_structure.md`: layout, modules, components, and ownership.
- `project_progress.md`: goal, overall progress, current position, next milestone.
- `project_diary.md`: lasting decisions, discarded approaches, and lessons.
- `latest_session_work.md`: detailed handoff evidence and continuation point.
- Module-specific documents, when present.

`project_progress.md` and `latest_session_work.md` may be edited only in
`deployment state` or when the user explicitly requests it. The main agent owns
them during normal execution. During automatic deployment closure, the single
`closure_steward` worker owns reconciliation of the complete documentation
framework; no other worker participates in that closure update.

Keep raw logs, temporary reasoning, and short-lived checkpoints out of durable
documents. Never delete a main project document without warning the user and
receiving a second explicit confirmation.

## Route Selection

There are three routes:

- **Light**: leaf-state work. The main agent works directly; no subagents.
- **Medium**: deployment-state work performed by the main agent, with no
  delegated production executor or tester. Companion provides workflow-mode
  secretary and context support; an optional read-only evidence wave and the
  documentation-only Closure Steward handoff never own implementation,
  verification, or root-cause decisions. Read
  `~/.codex/codex_workflow/medium_route.md`.
- **Heavy**: deployment-state work orchestrated through specialized workers.
  Read `~/.codex/codex_workflow/heavy_route.md`.

Heavy requires the session's currently selected main agent to be
`gpt-5.6-sol` or `gpt-5.6-terra` with subagent support available. This is a
session-model requirement, not a persistent workflow setting. If the selected
model is ineligible or its subagent support is unavailable, do not initialize
Companion or any other worker; ask the user to switch the current session to
Sol or Terra. Never pin or rewrite the main model in `config.toml`.

The user selects the route for the session. If unspecified, use Light; do not
infer Medium or Heavy. Light implies `leaf state`; Medium and Heavy imply
`deployment state` only for substantive work. Their direct fast path remains
`leaf state`. Keep the selected route until the user changes it or the session
ends.

## Context Loading

- In Light, inspect only material needed for the current task.
- Before initializing deployment state, classify the request. Questions and
  small or odd bounded tasks use the direct main-agent fast path even when
  Medium or Heavy is selected: call no worker, including Companion and
  `closure_steward`, and produce no worker statistics.
- For every substantive Medium or Heavy deployment, read the selected route and
  `companion.md`, then initialize or reuse the single persistent Companion.
  Read `investigation_team.md` before a Heavy evidence wave or an explicitly
  requested Medium evidence wave.
- Give Companion the session goal, known constraints, escalation boundaries,
  and evidence format. It is the main agent's secretary and office wrapper: it
  completes routine read-only work, retains context, filters coherent batches of
  operational reports, and returns the director brief defined in its contract.
- Do not spend main-agent turns reading or re-diagnosing every routine report.
  When a worker batch exists, register one coherent batch with Companion and
  name it in the dispatch envelopes; dispatched workers deliver detailed
  terminal reports directly to it and return compact receipts to the main agent.
  Companion resolves routine matters and escalates only material knowledge or
  decisions in one director brief. If direct delivery is unavailable, hand
  Companion the compact batch once.
- The main agent directly reads task-critical project documentation, relevant
  source paths and contracts, and decisive failure evidence. It owns defect
  identification, root-cause adjudication, architecture, scope, and final claims.
- For serious or ambiguous issues with independent search lanes, Heavy may use
  read-only investigators under `investigation_team.md`; Medium may use them
  only as explicitly requested evidence support. Investigators gather evidence;
  Companion filters their terminal report batch; the main agent opens decisive
  evidence and adjudicates the root cause.
- Resolve stale or conflicting project status with targeted evidence. Load only
  relevant module documentation and avoid replaying raw logs, large diffs,
  directory listings, or complete source files into the main context.
- Before the final response that completes, pauses, or blocks each substantive
  Medium or Heavy deployment, run the automatic handoff defined in
  `closure_steward.md` exactly once. Its worker inherits recent main-agent
  context and performs the complete documentation-framework update. The
  handoff is not a user command.

## Platform Paths

Workflow documents use `/` as a platform-neutral separator. Translate paths to
the current operating system and shell when running filesystem commands.
<!-- codex-workflow-managed-end -->

<!-- codex-workflow-project-personalization-start -->
<!-- codex-workflow-project-personalization-end -->

<!-- codex-workflow-project-local-instructions-start -->
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
<!-- codex-workflow-project-local-instructions-end -->
