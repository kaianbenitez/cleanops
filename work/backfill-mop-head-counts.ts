/**
 * One-time, idempotent import of legacy mop-head counts from customer notes.
 *
 * Usage:
 *   npx tsx work/backfill-mop-head-counts.ts           (dry run; no writes)
 *   npx tsx work/backfill-mop-head-counts.ts --apply   (writes only unset mop_head_count values)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { companies, customers } from "../src/db/schema";

const apply = process.argv.includes("--apply");
const MOP_HEAD_PATTERNS = [
  /mop\s*heads?\s*[:\-]?\s*(\d+)/i,
  /(\d+)\s*mop\s*heads?/i,
  /(\d+)\s*mops\b/i,
  /mops\s*[,\-]?\s*(\d+)/i,
];

function findMopHeadCount(value: string | null) {
  if (!value) return null;
  for (const pattern of MOP_HEAD_PATTERNS) {
    const match = value.match(pattern);
    if (!match) continue;
    const count = Number.parseInt(match[1], 10);
    if (count > 0 && count <= 50) return { count, snippet: match[0] };
  }
  return null;
}

async function main() {
  const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
  if (!company) throw new Error("No company found");

  const customerRows = await db
    .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, notes: customers.notes, operationalNotes: customers.operationalNotes })
    .from(customers)
    .where(eq(customers.companyId, company.id))
    .orderBy(customers.lastName, customers.firstName);

  const matches = customerRows.flatMap((customer) => {
    const notesMatch = findMopHeadCount(customer.notes);
    const match = notesMatch ?? findMopHeadCount(customer.operationalNotes);
    if (!match) return [];
    return [{ ...customer, field: notesMatch ? "notes" : "operationalNotes", ...match }];
  });

  console.log(`Mode: ${apply ? "APPLY (will write to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Reviewing ${matches.length} matching customers:`);
  for (const match of matches) console.log(`${match.firstName} ${match.lastName} | ${match.field} | "${match.snippet}" | ${match.count}`);

  if (!apply) {
    console.log("Dry run complete. Re-run with --apply to write these mop-head counts.");
    return;
  }

  for (const match of matches) {
    await db.update(customers).set({ mopHeadCount: match.count, updatedAt: new Date() }).where(and(eq(customers.id, match.id), eq(customers.companyId, company.id), isNull(customers.mopHeadCount)));
  }
  console.log(`Attempted ${matches.length} idempotent mop-head count updates. Existing counts, rags, and vacuum counts were not changed.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
