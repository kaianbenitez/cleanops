/**
 * Backfills `recurring_series` rows for customers imported from TheCustomerFactor
 * whose recurrence type was captured (src/work/import-tcf-customers.ts) but whose
 * price and schedule day never were — those live only in the job-enriched TCF CSV
 * export (Job Date / Price columns), not in the database.
 *
 * Matches customers by TCF's "Id" column (stored as customerNumber). Skips
 * customers already cancelled (status "lost") or archived, and any that already
 * have an active recurring series (idempotent — safe to re-run on an updated CSV).
 *
 * Usage:
 *   npx tsx work/create-recurring-series.ts "<path-to-csv>"            (dry run)
 *   npx tsx work/create-recurring-series.ts "<path-to-csv>" --commit    (writes)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import { parse } from "csv-parse/sync";
import { eq, and, isNull, ne } from "drizzle-orm";
import { db } from "../src/db";
import { companies, customers, recurringSeries } from "../src/db/schema";

const csvPath = process.argv[2];
const commit = process.argv.includes("--commit");

if (!csvPath) {
  console.error("Usage: npx tsx work/create-recurring-series.ts <path-to-csv> [--commit]");
  process.exit(1);
}

type Row = Record<string, string>;

const JOB_TYPE_TO_FREQUENCY: Record<string, "weekly" | "biweekly" | "every4weeks" | "monthly"> = {
  "Weekly Cleaning Service": "weekly",
  "Bi-Weekly Cleaning Service": "biweekly",
  "Monthly (4 weeks) Cleaning Service": "every4weeks",
  "Monthly (1 Time a month)": "monthly",
  "Monthly (5 weeks) Cleaning Service": "monthly",
};

function s(row: Row, key: string): string {
  return (row[key] ?? "").trim();
}

function pickPrimaryJobRow(rows: Row[]): Row {
  const recurring = rows.find((r) => s(r, "Job Type") in JOB_TYPE_TO_FREQUENCY);
  return recurring ?? rows[0];
}

/** TCF dates are "MM/DD/YY". */
function parseTcfDate(value: string): { iso: string; dayOfWeek: number } | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = 2000 + parseInt(yy, 10);
  const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return { iso, dayOfWeek: d.getUTCDay() };
}

function parsePriceCents(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

async function main() {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows: Row[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const [company] = await db.select().from(companies).limit(1);
  if (!company) throw new Error("No company found");

  const byId = new Map<string, Row[]>();
  for (const row of rows) {
    const id = s(row, "Id");
    if (!id) continue;
    const group = byId.get(id) ?? [];
    group.push(row);
    byId.set(id, group);
  }

  const dbCustomers = await db
    .select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      firstName: customers.firstName,
      lastName: customers.lastName,
      status: customers.status,
      archivedReason: customers.archivedReason,
    })
    .from(customers)
    .where(eq(customers.companyId, company.id));
  const customerByNumber = new Map(dbCustomers.map((c) => [c.customerNumber, c]));

  const existingSeries = await db
    .select({ customerId: recurringSeries.customerId })
    .from(recurringSeries);
  const hasSeries = new Set(existingSeries.map((s) => s.customerId));

  let noFrequency = 0;
  let noDbMatch = 0;
  let cancelledSkipped = 0;
  let alreadyHasSeries = 0;
  let badPrice = 0;
  let badDate = 0;
  let toCreate = 0;
  let created = 0;

  const examples: string[] = [];

  for (const [tcfId, group] of byId) {
    const row = pickPrimaryJobRow(group);
    const frequency = JOB_TYPE_TO_FREQUENCY[s(row, "Job Type")];
    if (!frequency) {
      noFrequency++;
      continue;
    }

    const customer = customerByNumber.get(tcfId);
    if (!customer) {
      noDbMatch++;
      continue;
    }

    if (customer.status === "lost" || customer.archivedReason) {
      cancelledSkipped++;
      continue;
    }

    if (hasSeries.has(customer.id)) {
      alreadyHasSeries++;
      continue;
    }

    const priceCents = parsePriceCents(s(row, "Price"));
    if (priceCents === null || priceCents <= 0) {
      badPrice++;
      continue;
    }

    const date = parseTcfDate(s(row, "Job Date"));
    if (!date) {
      badDate++;
      continue;
    }

    toCreate++;
    if (examples.length < 10) {
      examples.push(
        `${customer.firstName} ${customer.lastName}: ${frequency}, $${(priceCents / 100).toFixed(2)}, starts ${date.iso} (day ${date.dayOfWeek})`
      );
    }

    if (!commit) continue;

    await db.insert(recurringSeries).values({
      companyId: company.id,
      customerId: customer.id,
      frequency,
      dayOfWeek: date.dayOfWeek,
      startDate: date.iso,
      priceCents,
      defaultEmployeeIds: [],
      isActive: true,
    });
    created++;
  }

  console.log(`Mode: ${commit ? "COMMIT (wrote to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Distinct customers in CSV: ${byId.size}`);
  console.log(`No recognized recurring Job Type: ${noFrequency}`);
  console.log(`No matching customer in DB (by Id/customerNumber): ${noDbMatch}`);
  console.log(`Skipped — cancelled/archived in DB: ${cancelledSkipped}`);
  console.log(`Skipped — already has a recurring series: ${alreadyHasSeries}`);
  console.log(`Skipped — unparseable price: ${badPrice}`);
  console.log(`Skipped — unparseable Job Date: ${badDate}`);
  console.log(`${commit ? "Created" : "Would create"}: ${commit ? created : toCreate}`);
  console.log(`Examples:`);
  for (const e of examples) console.log(`  - ${e}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
