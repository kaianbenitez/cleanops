/**
 * Schema drift check: compares `src/db/schema.ts` against the database that
 * `DATABASE_URL` points at, and exits non-zero when the live database is
 * missing anything the application code expects.
 *
 * Why this exists: this database has never been tracked by drizzle-kit's
 * migration system (see DECISIONS.md / HANDOFF.md), so `drizzle-kit migrate`
 * cannot be used as the source of truth. Migrations here are applied by hand,
 * which means a committed migration file is *not* evidence that the change
 * reached the hosted DB. Twice now, migrations were committed and the
 * dependent UI shipped while the columns did not exist live — both times the
 * breakage was found by accident. This check closes that gap structurally.
 *
 * Read-only: it only queries `information_schema`. It never alters anything.
 *
 * Exit codes:
 *   0 — every table/column in schema.ts exists in the database.
 *   1 — something schema.ts expects is missing (application code will break).
 *   2 — could not run the check at all (no DATABASE_URL, connection failure).
 *
 * Columns/tables that exist in the database but NOT in schema.ts are reported
 * as informational only and never fail the check: dropping something live is a
 * separate, riskier decision, and leftovers are harmless to running code.
 */
import { getTableConfig } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ".env.local" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("check:drift — DATABASE_URL is not set; cannot compare schema.ts to a database.");
  process.exit(2);
}

/** Every table/column `schema.ts` declares, keyed by SQL table name. */
function expectedSchema(): Map<string, Set<string>> {
  const expected = new Map<string, Set<string>>();
  for (const value of Object.values(schema as Record<string, unknown>)) {
    let config;
    try {
      config = getTableConfig(value as never);
    } catch {
      continue; // Not a pgTable export (enum, relation, helper, type, ...).
    }
    expected.set(config.name, new Set(config.columns.map((column) => column.name)));
  }
  return expected;
}

async function main() {
  const sql = postgres(connectionString!, { prepare: false, max: 1 });
  let live: { table_name: string; column_name: string }[];
  try {
    live = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const liveSchema = new Map<string, Set<string>>();
  for (const { table_name, column_name } of live) {
    if (!liveSchema.has(table_name)) liveSchema.set(table_name, new Set());
    liveSchema.get(table_name)!.add(column_name);
  }

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const extras: string[] = [];

  for (const [table, columns] of [...expectedSchema()].sort(([a], [b]) => a.localeCompare(b))) {
    const liveColumns = liveSchema.get(table);
    if (!liveColumns) {
      missingTables.push(table);
      continue;
    }
    const missing = [...columns].filter((column) => !liveColumns.has(column)).sort();
    if (missing.length) missingColumns.push(`${table}: ${missing.join(", ")}`);
  }

  for (const [table, liveColumns] of [...liveSchema].sort(([a], [b]) => a.localeCompare(b))) {
    const columns = expectedSchema().get(table);
    if (!columns) {
      extras.push(`table "${table}" exists live but is not in schema.ts`);
      continue;
    }
    const extra = [...liveColumns].filter((column) => !columns.has(column)).sort();
    if (extra.length) extras.push(`${table}: ${extra.join(", ")} (live only)`);
  }

  if (missingTables.length) {
    console.error("\nMissing TABLES (schema.ts expects these; the database does not have them):");
    for (const table of missingTables) console.error(`  - ${table}`);
  }
  if (missingColumns.length) {
    console.error("\nMissing COLUMNS (schema.ts expects these; the database does not have them):");
    for (const entry of missingColumns) console.error(`  - ${entry}`);
  }
  if (extras.length) {
    console.log("\nLive-only, not failing the check (present in the database, absent from schema.ts):");
    for (const entry of extras) console.log(`  - ${entry}`);
  }

  if (missingTables.length || missingColumns.length) {
    console.error(
      "\ncheck:drift FAILED — application code references schema the database does not have.\n" +
        "Apply the matching migration SQL directly in a single transaction (NOT `npm run db:migrate`,\n" +
        "which does not work against this database — see HANDOFF.md).",
    );
    process.exit(1);
  }

  console.log("\ncheck:drift OK — every table and column in schema.ts exists in the database.");
}

main().catch((error) => {
  console.error("check:drift — could not complete the check:", error);
  process.exit(2);
});
