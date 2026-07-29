---
name: risk-remediation
description: Review, prioritize, remediate, validate, and maintain CleanOps' risk/flags artifact. Use when asked to scan the risk artifact, fix or work through its findings, address red/yellow/green risks, perform a security or launch-readiness remediation pass, or update risk status after implementation.
---

# CleanOps Risk Remediation

Use the repo-local risk artifact as the work queue. It is `RISK_ARTIFACT.md` at the repository root. Do not require a Claude login, an external URL, or another Markdown file before starting. If the local artifact does not exist, create it from the current codebase using the artifact format below. The historical external source is recorded only for reference in `references/artifact-source.md`.

## Operating rules

1. Read `PRODUCT.md` and `package.json` for application context. Do not block on, inherit work queues from, or require approval from any other Markdown artifact.
2. Reconcile the local artifact against the current code and configuration. Treat a finding as actionable only when it remains verified or has sufficient current evidence. Mark stale, duplicate, resolved, or unverifiable findings accordingly; do not carry them forward as open risks.
3. Work in this order: **Red / Critical-High**, then **Yellow / Medium**, then **Green / Low**. Within a color, prioritize cross-company exposure, unauthorized access, data loss, financial impact, production outage, then cost and reliability.
4. Address every actionable item that is safely within the current request and session. Do not skip a higher-priority verified item for an easier lower-priority one. If an item needs a user decision, credentials, a third-party account change, production-only action, or explicit approval, record the exact blocker and continue to the next safe item.
5. Preserve tenant authorization on every query and mutation. Never expose secrets. Do not weaken, bypass, or remove product authentication or authorization as part of remediation. Follow applicable system and user instructions for destructive, production, staging, commit, and push actions.
6. Make the smallest complete fix. Do not refactor unrelated code while remediating a finding.

## Per-finding loop

For each selected item:

1. **Verify**: inspect the cited path/route and surrounding control flow; reproduce with a safe test where practical. Record evidence or why verification failed.
2. **Plan**: state the intended fix and validation. For a material scope choice, security trade-off, or external-side effect, stop and ask the user rather than assume.
3. **Implement**: change only the necessary files. For a shared worktree, inspect `git status` and per-file diffs before staging; stage explicit paths only.
4. **Validate**: run focused tests plus the project-required verification (`npm run verify` before calling a code change ready). Run route smoke tests when applicable and available. State any validation that could not run and why.
5. **Update the artifact immediately**: retain history and update the finding with date, current status, evidence, files changed, verification result, remaining risk, and a commit/PR reference if one exists. A finding is resolved only after its intended validation passes. If mitigated but not eliminated, downgrade it with the residual risk stated plainly.
6. **Commit and push the completed remediation**: after updating `RISK_ARTIFACT.md` and validation, inspect `git status` and the diff for every intended file. Stage explicit intended paths only, create a focused commit, and push it. Never include unrelated/shared changes. If the branch is not safely pushable or the intended paths contain unrelated changes, stop and report the exact blocker.

## Artifact format

Preserve the existing layout. If it has no clear status schema, use:

| Priority | Status | Finding | Evidence | Remediation / next action | Validation | Updated |
|---|---|---|---|---|---|---|

Use statuses: `Open`, `In progress`, `Blocked`, `Needs decision`, `Mitigated`, `Resolved`, or `Not reproducible`. Keep red/yellow/green prioritization visible. Do not erase resolved findings; move them to a dated resolved section.

Update `RISK_ARTIFACT.md` directly. The external Claude artifact is optional historical context and does not need to be read or updated.

## Completion

Before reporting completion, re-scan all open findings and confirm that no verified Red item remains unaddressed while a lower-priority item was worked. Summarize:

- findings resolved, mitigated, blocked, and deferred;
- changed files and validation results;
- remaining Red, then Yellow, then Green work;
- any user decision or production action still needed.
