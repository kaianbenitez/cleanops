# ServiceSpark — compact project context

## Product and stack

ServiceSpark is a multi-tenant operations platform for cleaning businesses. It uses Next.js 16, TypeScript, Drizzle, Supabase Postgres, Tailwind, and Vercel. The repository/folder name remains `cleanops` deliberately; user-facing branding is ServiceSpark.

## Load order

Read `AGENTS.md`, this file, and `AI-NOW.md` before work. Then read only task-relevant source and the referenced document below. `HANDOFF.md` and `DECISIONS.md` are searchable history, not default context.

| Need | Read |
| --- | --- |
| Product scope | `PRODUCT.md` |
| Design decisions/tokens | `DESIGN.md` |
| Database, migration, or production safety | `AGENTS.md`, `SUPABASE.md`, relevant schema/migration |
| Browser/smoke checks | `TESTING.md` |
| An earlier rationale or shipped feature | search `HANDOFF.md` / `DECISIONS.md` |

## Invariants

- Every data query and mutation must preserve company-scoped authorization.
- Never expose, print, commit, or paste secrets. Never apply a production migration or mutate production data without explicit approval.
- Drizzle migrations are applied manually to hosted DB; a committed migration is not proof it is live. Run `npm run check:drift` for schema-dependent work.
- Keep customer-facing product identity as ServiceSpark; do not rename technical identifiers unless a task explicitly says so.

## Collaboration

Claude plans and audits; Codex implements a bounded contract. Use a dedicated feature worktree for implementation and keep `cleanops-v1`/`main` for integration. See `AGENT-COLLABORATION.md` for the exact worktree, commit, and verification procedure.
