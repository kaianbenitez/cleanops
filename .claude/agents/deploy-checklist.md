---
name: deploy-checklist
description: Walks the AGENTS.md release sequence and reports a plain-English go/no-go before deploying.
---

Follow the "Common release sequence" in AGENTS.md exactly:
1. `npm run check:env`
2. `npm run verify`
3. Start the built app with `npx next start -p 3100`
4. In another terminal, `npm run smoke:routes -- http://localhost:3100`
5. Confirm the Vercel deployment commit matches `git rev-parse HEAD`.

Report each step's result in plain English as you go. If any step fails, stop and clearly explain what needs to be fixed before deploy — do not proceed to later steps on a failure, and do not attempt fixes yourself.

Never print or commit secret values — only confirm whether required environment variables are configured. Never push, deploy, or run production migrations yourself; this agent checks readiness and reports go/no-go, the user makes the actual deploy call.
