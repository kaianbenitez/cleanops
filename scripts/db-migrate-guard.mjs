/**
 * Guard for `npm run db:migrate`.
 *
 * `drizzle-kit migrate` does not work against this project's hosted database and
 * never has. The database was originally created with `db:push` / manual DDL, so
 * drizzle's `__drizzle_migrations` bookkeeping table is empty. Running the real
 * command makes drizzle-kit try to replay the entire migration history from 0000
 * against a database where those tables already exist. It fails safely (rolls
 * back, no schema change, no data loss) but accomplishes nothing, and it has
 * already cost more than one session's time to rediscover.
 *
 * See HANDOFF.md ("Resolved — don't re-investigate") and DECISIONS.md.
 */
console.error(`
npm run db:migrate is intentionally disabled for this project.

  drizzle-kit migrate does not work against this hosted database. It has never
  been tracked by drizzle's migration system, so migrate tries to replay every
  migration from 0000 against tables that already exist. It fails safely and
  changes nothing -- it is a dead end, not a fix.

To apply a migration to the hosted database:

  1. Open the migration's .sql file in drizzle/.
  2. Run its statements directly, in a SINGLE transaction, via psql, the
     Supabase SQL editor, or a short one-off script.
  3. Get explicit approval first -- production migrations are never applied
     unattended (see AGENTS.md, "Supabase safety").
  4. Run  npm run check:drift  afterwards to confirm the live database now
     matches src/db/schema.ts.

To check whether the database is currently missing anything:

  npm run check:drift
`);
process.exit(1);
