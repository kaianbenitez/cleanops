Audit database backup readiness.

Inspect `.github/workflows/db-backup.yml` and confirm the `DATABASE_URL` secret is trimmed and non-empty before `pg_dump`.
Remind the user that Supabase Session Pooler/direct connection is preferred for dumps and that the GitHub Action must be manually run once after secret changes.
Never print the database URL or any secret.
