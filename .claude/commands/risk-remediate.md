Use `RISK_ARTIFACT.md` as the CleanOps remediation queue.

Complete **only one** verified actionable item: the highest-priority Open item in strict Red → Yellow → Green order. Do not skip it for an easier lower-priority one. After its artifact update and Git push, stop. A fresh session will use the updated artifact to select the next item.

For each item: re-verify it; mark it stale, duplicate, resolved, or not reproducible if appropriate; otherwise implement the smallest complete safe fix; run focused validation plus `npm run verify`; and immediately update `RISK_ARTIFACT.md` with status, evidence, files changed, validation, residual risk/blocker, and date.

Preserve product authentication, authorization, tenant isolation, secret safety, and user data. Do not make unrelated refactors. For credentials, production-only work, destructive actions, or material user/business decisions, record the exact blocker as `Blocked` or `Needs decision`, then continue with the next safe item.

Before each commit, inspect `git status` and every intended file diff. Stage explicit remediation-related paths only. Commit each completed, validated remediation with a focused message and push to `main`. Never include unrelated/shared changes.

Finish by summarizing that one item's outcome, validation, remaining Red → Yellow → Green work, and its pushed commit hash. Then stop; do not begin another item.
