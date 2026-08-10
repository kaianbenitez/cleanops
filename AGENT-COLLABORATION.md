# Claude feature workflow

**Claude plans, implements, and reviews its own work.** Codex is not part of
the default workflow — Claude scopes the task itself, implements it in a
fresh feature worktree, verifies it, then merges into the integration
checkout. Only involve Codex if the user explicitly asks for it.

Use a fresh worktree per feature. The shared main checkout is for integration only — never implement directly there.

## Worktrees

| Role | Folder | Branch | Purpose |
| --- | --- | --- | --- |
| Integration | `C:\Users\kbeni\Downloads\cleanops-v1` | `main` | Keep clean; Claude merges/reviews/verifies/pushes finished feature work here. |
| Feature | `C:\Users\kbeni\Downloads\cleanops-<feature-name>` | `codex/<feature-name>` (branch naming kept for continuity) | One fresh worktree per feature, created off current `main`, removed after merge. |

Do not implement directly in the integration checkout. If more than one feature is in flight at once, never edit the same file across worktrees at the same time without deciding who owns conflict resolution.

## Feature workflow

1. Create a fresh feature worktree off current `main` (`git worktree add ... -b <branch> main`).
2. Implement the change there, following the codebase's existing conventions.
3. Commit only explicit paths in that worktree. Never use `git add .` or `git add -A`.
4. In the integration checkout: merge or cherry-pick the feature commit into `main`.
5. Run `npm run check:env`, `npm run check:drift` when schema-related, and `npm run verify`.
6. Run smoke checks when a local production server is available (see `TESTING.md`).
7. Push `main` only after the integration worktree is clean and verified.
8. Remove the feature worktree and its local branch once merged and pushed.

If `main` advances or a merge/cherry-pick conflicts, stop and report the commit and conflicting files rather than forcing it through.

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