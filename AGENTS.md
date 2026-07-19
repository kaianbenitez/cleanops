<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## CleanOps working rules

- Run `npm run verify` before presenting a change as ready.
- Run `npm run smoke:routes` when a local production server is available.
- Never print, commit, or paste secret values. Check only whether required variables are configured.
- GHL checks must use the approved test location and read-only requests unless the user explicitly asks for a write test.
- Preserve company-scoped authorization on every database query and API mutation.
- For quote changes, verify both the internal quote builder and the unauthenticated public proposal.
- For My Day changes, verify mobile one-handed use, travel/clock-in/break/finish state, undo behavior, and server refresh ordering.
- Do not stage `.claude/settings.local.json`, `.codex/`, or other local tool state unless explicitly requested.

## Common release sequence

1. `npm run check:env`
2. `npm run verify`
3. Start the built app with `npx next start -p 3100`
4. In another terminal, run `npm run smoke:routes -- http://localhost:3100`
5. Confirm the Vercel deployment commit matches `git rev-parse HEAD`.

## Supabase safety

- Use `npm run supabase:status` to inspect the local CLI stack.
- Local Supabase requires Docker Desktop.
- The hosted database is managed through Drizzle migrations in this project.
- Never run `npm run supabase:reset`, `db push`, or production migrations without explicit approval.
