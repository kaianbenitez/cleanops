@AGENTS.md
@HANDOFF.md

Before making any change, read `AGENT-COLLABORATION.md` and `AGENTS.md`.

Claude Code plans, scopes, and evaluates in this repo — it does not write or
edit product code directly. Delegate implementation (features, fixes,
refactors, and anything that mutates data) to Codex via the `codex` MCP
server with a structured contract; Claude reviews the diff and verification
output before integrating. Small, throwaway, read-only investigation scripts
are fine for Claude to write itself to inform a plan.

  Work only in the integration checkout (`cleanops-v1/main`) for review,
  verification, and cherry-picking finished Codex work — never for active
  implementation.