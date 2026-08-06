/**
 * One-time cleanup of three explicitly scoped legacy test accounts in Simply Maid.
 *
 * Usage:
 *   npx tsx work/cleanup-legacy-test-accounts.ts           (dry run; no writes)
 *   npx tsx work/cleanup-legacy-test-accounts.ts --apply   (deletes only the checked rows)
 *
 * Safety checks run in both modes. The script aborts if any user/email/company,
 * foreign-key reference, payroll amount/status, or Supabase Auth identity differs
 * from the approved scope below.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const SIMPLY_MAID_COMPANY_ID = "4d070ca2-b487-481a-b22e-4ce14987653b";
const apply = process.argv.includes("--apply");
const targets = [
  { id: "3e28d17b-40e9-44cf-8284-35e97fb7891d", email: "qa.tester@example.com" },
  { id: "5b267bd2-6a4d-49df-bff7-a4640e17a5fa", email: "testcleaner@cleanops.local" },
  { id: "81718279-af9b-4874-86e4-24a81e14ad05", email: "mariagomez@cleanops.local" },
] as const;
const ids = targets.map((target) => target.id);
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

function quoteIdentifier(identifier: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Unexpected database identifier: ${identifier}`);
  return `"${identifier}"`;
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  console.log(`Mode: ${apply ? "APPLY (will delete checked DB rows and Supabase Auth accounts)" : "DRY RUN (no writes)"}`);
  const userRows = await sql`select id, company_id, email from users where id = any(${ids}::uuid[]) order by id`;
  if (userRows.length !== targets.length) throw new Error(`Safety check failed: expected ${targets.length} target user rows, found ${userRows.length}. No changes were made.`);
  for (const target of targets) {
    const user = userRows.find((row) => row.id === target.id);
    if (!user || user.company_id !== SIMPLY_MAID_COMPANY_ID || user.email.toLowerCase() !== target.email) {
      throw new Error(`Safety check failed: ${target.id} no longer matches its expected Simply Maid email/company. No changes were made.`);
    }
  }

  const foreignKeys = await sql`
    select kcu.table_schema, kcu.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public' and ccu.table_name = 'users' and ccu.column_name = 'id'
    order by kcu.table_schema, kcu.table_name, kcu.column_name
  `;
  const references: Array<{ table: string; column: string; count: number }> = [];
  for (const foreignKey of foreignKeys) {
    const table = `${quoteIdentifier(foreignKey.table_schema)}.${quoteIdentifier(foreignKey.table_name)}`;
    const column = quoteIdentifier(foreignKey.column_name);
    const [result] = await sql.unsafe(`select count(*)::int as count from ${table} where ${column} = any($1::uuid[])`, [ids]);
    references.push({ table: `${foreignKey.table_schema}.${foreignKey.table_name}`, column: foreignKey.column_name, count: result.count });
  }
  const unexpectedReferences = references.filter((reference) => reference.table !== "public.payroll_lines" && reference.count > 0);
  if (unexpectedReferences.length) {
    throw new Error(`Safety check failed: target users still have non-payroll references: ${unexpectedReferences.map((reference) => `${reference.table}.${reference.column}=${reference.count}`).join(", ")}. No changes were made.`);
  }

  const payrollRows = await sql`
    select pl.id, pl.user_id, pl.final_cents, pp.status as period_status
    from payroll_lines pl
    join payroll_periods pp on pp.id = pl.payroll_period_id
    where pl.user_id = any(${ids}::uuid[])
    order by pl.user_id, pl.id
  `;
  const unsafePayroll = payrollRows.filter((row) => row.final_cents !== 0 || row.period_status !== "open");
  if (unsafePayroll.length) throw new Error("Safety check failed: one or more payroll lines is non-zero or not in an open period. No changes were made.");

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const authUsers = [] as Array<{ id: string; email?: string }>;
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Safety check failed: could not list Supabase Auth users: ${error.message}`);
    authUsers.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
    if (data.users.length < 1000) break;
  }
  const authTargets: Array<{ id: string; email: string; authId: string }> = [];
  const missingAuthEmails: string[] = [];
  for (const target of targets) {
    const matches = authUsers.filter((user) => user.email?.toLowerCase() === target.email);
    if (matches.length > 1) throw new Error(`Safety check failed: expected at most one Supabase Auth account for ${target.email}, found ${matches.length}. No changes were made.`);
    if (matches.length === 1) authTargets.push({ ...target, authId: matches[0].id });
    else missingAuthEmails.push(target.email);
  }

  console.log(`Verified ${targets.length} exact Simply Maid users, ${foreignKeys.length} live foreign-key columns to users.id, and ${payrollRows.length} safe open/$0 payroll line(s).`);
  for (const reference of references) console.log(`- ${reference.table}.${reference.column}: ${reference.count}`);
  console.log(`Would delete ${payrollRows.length} payroll_lines row(s), 3 users rows, and ${authTargets.length} matching Supabase Auth account(s).`);
  if (missingAuthEmails.length) console.log(`No Supabase Auth account exists for ${missingAuthEmails.join(", ")}; those Auth deletions will be skipped.`);
  if (!apply) {
    console.log("Dry run complete. Re-run with --apply to perform this exact checked cleanup.");
    await sql.end();
    return;
  }

  try {
    await sql.begin(async (tx) => {
      await tx`delete from payroll_lines where user_id = any(${ids}::uuid[])`;
      await tx`delete from users where id = any(${ids}::uuid[]) and company_id = ${SIMPLY_MAID_COMPANY_ID}`;
      for (const target of authTargets) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(target.authId);
        if (error) throw new Error(`Could not delete Supabase Auth account ${target.email}: ${error.message}`);
      }
    });
  } finally {
    await sql.end();
  }
  console.log(`Deleted ${payrollRows.length} payroll_lines row(s), 3 users rows, and ${authTargets.length} matching Supabase Auth account(s).`);
  if (missingAuthEmails.length) console.log(`Skipped ${missingAuthEmails.length} absent Supabase Auth account(s): ${missingAuthEmails.join(", ")}.`);
}

main().catch(async (error) => {
  console.error(error);
  await sql.end().catch(() => undefined);
  process.exit(1);
});
