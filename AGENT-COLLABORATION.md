# Claude + Codex collaboration workflow

Use separate worktrees for active feature work. The shared main checkout is for integration only.

## Worktrees

| Role | Folder | Branch | Purpose |
| --- | --- | --- | --- |
| Integration | `C:\Users\kbeni\Downloads\cleanops-v1` | `main` | Keep clean; cherry-pick, verify, and push finished work here. |
| Claude | `C:\Users\kbeni\Downloads\cleanops-claude` | Claude feature branch | Claude's active implementation work. |
| Codex | `C:\Users\kbeni\Downloads\cleanops-codex` | Codex feature branch | Codex's active implementation work. |

Do not actively implement in the integration checkout. Never have both agents edit the same file at the same time, even in separate worktrees, without deciding who owns conflict resolution.

## Feature workflow

1. Start from the agent's dedicated worktree and update its branch from `main`.
2. Make only the scoped change, inspect the diff, and run the relevant checks.
3. Commit only explicit paths. Never use `git add .` or `git add -A`.
4. Push the agent's feature branch, not `main`.
5. Assign one integrator (normally Claude) to use a clean integration worktree:
   - fetch current `origin/main`;
   - cherry-pick the feature commit;
   - resolve conflicts only if assigned to do so;
   - run `npm run check:env`, `npm run check:drift` when schema-related, and `npm run verify`;
   - run smoke checks when a local production server is available;
   - push `main` only after the integration worktree is clean and verified.

If `main` advances or a cherry-pick conflicts, stop integration and report the commit and conflicting files. Do not force-push or overwrite another agent's work.

## Commit and staging safety

Before every commit, run:

```powershell
git status --short
git diff --cached --name-only
```

Stage and commit explicit files only:

```powershell
git add -- path/to/file
git commit --only -m "Describe the feature" -- path/to/file
```

`git push` sends committed history only. The risk is staging, committing, pulling, merging, or rebasing in a worktree that contains someone else's uncommitted work.

## Codex smoke-test readiness

The Codex worktree needs all of the following before it can run meaningful smoke or authenticated browser checks:

- an ignored `.env.local` with the required app environment variables;
- installed dependencies matching `package-lock.json` (`npm ci` after branch or lockfile changes);
- `BROWSER_ADMIN_USERNAME` and `BROWSER_ADMIN_PASSWORD` in `.env.local` for authenticated browser checks; without them, browser specs may skip;
- a free local port and a freshly built production server, per `TESTING.md`.

Never copy, print, commit, or paste secret values. Check only whether variables and dependencies are present.