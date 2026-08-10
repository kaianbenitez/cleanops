@AGENTS.md

Before making any change, read `AI-CONTEXT.md` and `AI-NOW.md` — both are short. Read `AGENT-COLLABORATION.md` before worktree, integration, or commit/push work; it holds the current worktree map and machine-specific paths, which change more often than this file. Open `HANDOFF.md`, `DECISIONS.md`, `PLAN.md`, or a feature-specific `HANDOFF.*.md` only for the specific question at hand — see the load-order table in `AI-CONTEXT.md`.

## Implementing directly vs. delegating to Codex

Default: Claude plans, scopes, and reviews; Codex implements features, fixes, refactors, and anything that mutates data, via a structured contract (goal, files/areas in scope, acceptance criteria, constraints, verification commands) run through the `codex` MCP server. Claude reviews the diff and verification output before integrating.

Claude may implement directly instead when any of these hold:

- The session is explicitly configured to edit in place, rather than isolated into a worktree.
- The user explicitly asks Claude to make the change itself.
- The change is small, low-risk, and self-contained (docs, config, a scoped one-file fix) — not worth a full Codex contract.

In the shared integration checkout (`cleanops-v1/main`) specifically, never implement directly — only review, verify, cherry-pick, and push finished Codex work, regardless of which of the above would otherwise apply. See `AGENT-COLLABORATION.md` for that procedure.

Small, throwaway, read-only investigation scripts are always fine for Claude to write itself, in any checkout, to inform a plan.
