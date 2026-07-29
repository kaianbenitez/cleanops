Audit exactly **one** CleanOps risk category and update `RISK_ARTIFACT.md` directly. Do not change application code, dependencies, migrations, infrastructure, or secrets. Do not require a Claude login or an external artifact URL.

If the user supplies a category, audit only that category. Otherwise, read the artifact's `Audit coverage` section and select the first unchecked category in this order:

1. Auth, authorization, IDOR, and company/tenant isolation
2. API validation, uploads, webhooks, secrets, SSRF, XSS, and SQL injection
3. Database safety, migrations, backups, data loss, and concurrency
4. External integrations and silent mock/fallback behavior
5. Production configuration, CI, monitoring, and deployment readiness
6. Reliability, dates/timezones, and privacy
7. Performance, unbounded queries, and third-party API cost

Read only the code, routes, schema/configuration, and tests relevant to the selected category. Verify findings against current evidence. Keep only actionable, evidence-based items; mark stale, duplicate, resolved, or unsupported findings as resolved/not reproducible. Prioritize findings as Red (Critical/High), Yellow (Medium), or Green (Low). For every open item, include evidence, affected files/routes, impact, remediation, validation needed, status, and update date.

Create an `Audit coverage` section if it is missing. Record the selected category, its completion date, scope inspected, and a brief outcome there. Do not mark a category complete if relevant code/configuration could not be inspected.

Finish with a concise summary of this category's findings and the next category. Then stop; do not begin another category.
