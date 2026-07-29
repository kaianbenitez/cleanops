Audit CleanOps for current, actionable risk findings and update `RISK_ARTIFACT.md` directly.

This is an audit-only command. Do not change application code, dependencies, migrations, infrastructure, or secrets. Do not require a Claude login or an external artifact URL.

Read `PRODUCT.md`, `package.json`, `RISK_ARTIFACT.md`, source code, API routes, schema/migrations, CI/deployment configuration, and relevant tests. Verify risks in these areas:

- authentication, authorization, IDOR, and company/tenant isolation;
- validation, uploads, webhooks, secrets, SSRF, XSS, and SQL injection;
- migrations, data safety, backups, concurrency, and silent fallbacks;
- reliability, dates/timezones, privacy, performance/cost, monitoring, CI, and launch readiness.

Keep only evidence-based, current findings. Mark stale, duplicate, resolved, or unsupported items as resolved/not reproducible. Prioritize Red (Critical/High), then Yellow (Medium), then Green (Low). For every open item, record evidence, affected files/routes, impact, remediation, validation needed, status, and update date.

End with the top three risks, launch blockers, and next actions in Red → Yellow → Green order. Re-read the artifact for accuracy and duplicates before finishing.
