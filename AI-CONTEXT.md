# Shimmer — compact project context

## Product and stack

Shimmer is a multi-tenant operations platform for cleaning businesses. It uses Next.js 16, TypeScript, Drizzle, Supabase Postgres, Tailwind, and Vercel. The repository/folder name remains `cleanops` deliberately; user-facing branding is Shimmer.

## Load order

`CLAUDE.md` already directs the agent to this file and `AI-NOW.md` before any change. From
here, read only task-relevant source plus the referenced document below. `HANDOFF.md`,
`DECISIONS.md`, `PLAN.md`, and the feature-specific handoffs are searchable history, not
default context — grep them for the specific question at hand rather than reading them whole.

| Need | Read |
| --- | --- |
| Product scope | `PRODUCT.md` |
| Design decisions/tokens | `DESIGN.md` |
| Database, migration, or production safety | `AGENTS.md`, `SUPABASE.md`, relevant schema/migration |
| Browser/smoke checks | `TESTING.md` |
| Worktree map, commit/integration procedure | `AGENT-COLLABORATION.md` |
| An earlier rationale or shipped feature | search `HANDOFF.md` / `DECISIONS.md` / `PLAN.md` |
| History for one specific feature area | search `HANDOFF.calendar-audit.md`, `HANDOFF.dashboard-reports-redesign.md`, `HANDOFF.ui-audit-followup.md`, or `UI-AUDIT.md` |

## Invariants

These apply to every task, regardless of what it is. Process rules that aren't blanket
invariants live in `AGENTS.md` instead.

- Every data query and mutation must preserve company-scoped authorization.
- Never expose, print, commit, or paste secrets. Never apply a production migration or mutate production data without explicit approval.
- Drizzle migrations are applied manually to hosted DB; a committed migration is not proof it is live. Run `npm run check:drift` for schema-dependent work.
- Keep customer-facing product identity as Shimmer; do not rename technical identifiers unless a task explicitly says so.

## Collaboration

See `CLAUDE.md` for the implementation workflow (Claude implements directly via feature
worktrees). See `AGENT-COLLABORATION.md` for the current worktree map (this is a
multi-machine setup — that file, not this one, is the source of truth for machine-specific
paths) and the commit and integration procedure.
