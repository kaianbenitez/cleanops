Run the CleanOps verification sequence.

1. Run `npm run check:env` and report only configured/missing names; never print values.
2. Run `npm run lint`, `npm run typecheck`, and `npm run build`.
3. If a local server is already running, run `npm run smoke:routes -- http://localhost:3000`.
4. Summarize failures by file and explain whether they block beta.

Do not modify application code unless the user explicitly asks for fixes.
