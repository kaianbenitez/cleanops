Use `RISK_ARTIFACT.md` as the CleanOps remediation queue.

Work verified actionable items in strict Red → Yellow → Green order. Do not skip a higher-priority item for an easier lower-priority one.

For each item: re-verify it; mark it stale, duplicate, resolved, or not reproducible if appropriate; otherwise implement the smallest complete safe fix; run focused validation plus `npm run verify`; and immediately update `RISK_ARTIFACT.md` with status, evidence, files changed, validation, residual risk/blocker, and date.

Preserve product authentication, authorization, tenant isolation, secret safety, and user data. Do not make unrelated refactors. For credentials, production-only work, destructive actions, or material user/business decisions, record the exact blocker as `Blocked` or `Needs decision`, then continue with the next safe item.

Before each commit, inspect `git status` and every intended file diff. Stage explicit remediation-related paths only. Commit each completed, validated remediation with a focused message and push to `main`. Never include unrelated/shared changes.

Finish by summarizing resolved/mitigated items, blockers, validation, remaining Red → Yellow → Green work, and pushed commit hashes.
