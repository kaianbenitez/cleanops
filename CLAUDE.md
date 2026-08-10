@AGENTS.md

Before making any change, read `AI-CONTEXT.md` and `AI-NOW.md` — both are short. Read `AGENT-COLLABORATION.md` before worktree, integration, or commit/push work; it holds the current worktree map and machine-specific paths, which change more often than this file. Open `HANDOFF.md`, `DECISIONS.md`, `PLAN.md`, or a feature-specific `HANDOFF.*.md` only for the specific question at hand — see the load-order table in `AI-CONTEXT.md`.

## Implementation

Claude plans, scopes, implements, and reviews its own work directly — the `codex` MCP server is not the default path here. For a feature, fix, or refactor: branch into a fresh feature worktree (see `AGENT-COLLABORATION.md` for the worktree/branch convention), implement there, run the project's own verification (`npm run verify`, `check:drift` when schema-dependent, smoke checks per `TESTING.md`), then merge into `cleanops-v1/main` and push per the commit/push rules in this file.

Small, throwaway, read-only investigation scripts are always fine to write directly, in any checkout, to inform a plan.

Only involve Codex if the user explicitly asks for it (e.g. a second opinion or an independent implementation).
