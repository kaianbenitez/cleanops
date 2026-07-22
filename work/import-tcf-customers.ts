/**
 * Bulk-imports customers from a TheCustomerFactor CSV export that includes
 * the "Job Type" / "Job Date" / "Job location" columns (the job-enriched
 * export, not the plain customer-list export).
 *
 * Usage:
 *   npx tsx work/import-tcf-customers.ts "<path-to-csv>"            (dry run — no writes)
 *   npx tsx work/import-tcf-customers.ts "<path-to-csv>" --commit    (writes to the DB)
 *
 * Recurrence is derived from Job Type where TCF uses an unambiguous
 * frequency name (weekly / bi-weekly / monthly-4-weeks / monthly). Job
 * types that don't map to a known frequency (one-time services, fees,
 * TIP, "3 Weeks Cleaning Service") leave recurrence null and are listed
 * in the summary for manual follow-up.
 *
 * A customer with multiple job rows (e.g. a recurring visit plus a TIP or
 * add-on fee line) is deduplicated by Id, preferring the row with a
 * recognized recurring Job Type over fee/add-on rows.
 *
 * Re-running is safe: customers are matched by TCF's "Id" column
 * (stored as customerNumber) and already-imported rows are skipped.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { companies, customers, customerLocations, roomTypes } from "../src/db/schema";

const csvPath = process.argv[2];
const commit = process.argv.includes("--commit");

if (!csvPath) {
  console.error("Usage: npx tsx work/import-tcf-customers.ts <path-to-csv> [--commit]");
  process.exit(1);
}

type Row = Record<string, string>;

const JOB_TYPE_TO_RECURRENCE: Record<string, "weekly" | "biweekly" | "every4weeks" | "monthly"> = {
  "Weekly Cleaning Service": "weekly",
  "Bi-Weekly Cleaning Service": "biweekly",
  "Monthly (4 weeks) Cleaning Service": "every4weeks",
  "Monthly (1 Time a month)": "monthly",
  "Monthly (5 weeks) Cleaning Service": "monthly", // approximation — TCF has no 5-week bucket in our enum
};

function s(row: Row, key: string): string {
  return (row[key] ?? "").trim();
}

/** Picks the row that carries the customer's real recurring service (if any)
 *  out of a group of same-Id rows that otherwise just repeat contact info. */
function pickPrimaryJobRow(rows: Row[]): Row {
  const recurring = rows.find((r) => s(r, "Job Type") in JOB_TYPE_TO_RECURRENCE);
  return recurring ?? rows[0];
}

/** Falls back to the street portion of "Job location" (format:
 *  "123 Main St, City, ST 12345") when the customer record itself has no address. */
function addressFromJobLocation(row: Row): string | null {
  const loc = s(row, "Job location");
  if (!loc) return null;
  const [street] = loc.split(",");
  return street?.trim() || null;
}

function combine(row: Row, pairs: [string, string][]): string | null {
  const parts = pairs
    .map(([label, key]) => [label, s(row, key)] as const)
    .filter(([, v]) => v !== "")
    .map(([label, v]) => `${label}: ${v}`);
  return parts.length ? parts.join("\n") : null;
}

function toTags(row: Row): string[] {
  const raw = s(row, "Tags");
  if (!raw) return [];
  return raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
}

/** House Entry / Key # / Garage Code / Gate Code / Alarm Code / Mop Heads
 *  Needed / Trash Bags / Vacuum Cleaner Kept all map straight onto
 *  customerLocations' own dedicated columns — that's what the customer
 *  profile page actually reads, not a combined string on customers. */
function toLocationAccessFields(row: Row) {
  return {
    accessInstructions: s(row, "House Entry") || null,
    keyNumber: s(row, "Key #") || null,
    garageCode: s(row, "Garage Code") || null,
    gateCode: s(row, "Gate Code") || null,
    alarmCode: s(row, "Alarm Code") || null,
    vacuumLocation: s(row, "Vacuum Cleaner Kept") || null,
    mopHeadsNeeded: s(row, "Mop Heads Needed") || null,
    trashBags: s(row, "Trash Bags") || null,
  };
}

/** Extracts a room count from TCF's free-text values ("4 Bedrooms" -> 4,
 *  "1 Shower & Tub (Master) Bathroom" -> 1). Falls back to 1 for
 *  description-only values ("Small Laundry Area") since their presence
 *  means the room exists, just without a stated count. */
function parseCount(value: string): number | null {
  const match = value.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  return value.trim() ? 1 : null;
}

const ROOM_FIELD_TO_TYPE_NAME: [string, string][] = [
  ["Bedrooms", "Bedrooms"],
  ["Bathroom (Shower & Tub Area)", "Master Bathroom"],
  ["Bathroom (Shower/Tub Combo)", "Full Bathroom"],
  ["1/2 Bathroom", "Half Bathroom"],
  ["Living Rooms", "Living Room"],
  ["Dining Room", "Dining Room"],
  ["Laundry Room", "Laundry Room"],
  ["Hallway", "Hallway"],
  ["Stairs", "Stairs"],
  ["Office", "Office"],
];
const KITCHEN_SIZE_TO_TYPE_NAME: [string, string][] = [
  ["large", "Kitchen Large"],
  ["medium", "Kitchen Medium"],
  ["small", "Kitchen Small"],
];
const OTHER_ROOM_FIELDS = ["Theater/Game room", "Other"]; // TCF has no matching room type — folded into "Other"

/** Builds the { roomCounts, dirtLevel, clutterCode } shape the customer
 *  profile page and quote-autofill actually read, keyed by this company's
 *  real room_type ids (not TCF's raw column names). */
function toHomeDetails(row: Row, roomTypeIdByName: Map<string, string>): Record<string, unknown> {
  const roomCounts: Record<string, number> = {};

  for (const [tcfField, typeName] of ROOM_FIELD_TO_TYPE_NAME) {
    const raw = s(row, tcfField);
    if (!raw) continue;
    const count = parseCount(raw);
    const typeId = roomTypeIdByName.get(typeName);
    if (count && typeId) roomCounts[typeId] = count;
  }

  const kitchens = s(row, "Kitchens").toLowerCase();
  for (const [keyword, typeName] of KITCHEN_SIZE_TO_TYPE_NAME) {
    if (kitchens.includes(keyword)) {
      const typeId = roomTypeIdByName.get(typeName);
      if (typeId) roomCounts[typeId] = 1;
      break;
    }
  }

  let otherCount = 0;
  for (const f of OTHER_ROOM_FIELDS) {
    const raw = s(row, f);
    if (raw) otherCount += parseCount(raw) ?? 1;
  }
  if (otherCount) {
    const typeId = roomTypeIdByName.get("Other");
    if (typeId) roomCounts[typeId] = otherCount;
  }

  const details: Record<string, unknown> = {};
  if (Object.keys(roomCounts).length) details.roomCounts = roomCounts;
  const dirtLevel = s(row, "Dirt Level");
  if (dirtLevel) details.dirtLevel = dirtLevel;
  const clutterCode = s(row, "Clutter Code");
  if (clutterCode) details.clutterCode = clutterCode;
  return details;
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
  if (!company) throw new Error("No company found — run the config import first");

  const companyRoomTypes = await db.select().from(roomTypes).where(eq(roomTypes.companyId, company.id));
  const roomTypeIdByName = new Map(companyRoomTypes.map((rt) => [rt.name, rt.id]));

  const existing = await db
    .select({ customerNumber: customers.customerNumber })
    .from(customers)
    .where(eq(customers.companyId, company.id));
  const alreadyImported = new Set(existing.map((c) => c.customerNumber).filter(Boolean));

  const byId = new Map<string, Row[]>();
  const noId: Row[] = [];
  for (const row of rows) {
    const id = s(row, "Id");
    if (!id) {
      noId.push(row);
      continue;
    }
    const group = byId.get(id) ?? [];
    group.push(row);
    byId.set(id, group);
  }
  const customerRows = [...[...byId.values()].map(pickPrimaryJobRow), ...noId];

  let toImport = 0;
  let skippedExisting = 0;
  let skippedNoName = 0;
  let canceled = 0;
  let noAddress = 0;
  const recurrenceCounts: Record<string, number> = { weekly: 0, biweekly: 0, every4weeks: 0, monthly: 0, none: 0 };
  const unmappedJobTypes = new Map<string, number>();
  let inserted = 0;

  for (const row of customerRows) {
    const tcfId = s(row, "Id");
    if (tcfId && alreadyImported.has(tcfId)) {
      skippedExisting++;
      continue;
    }

    let firstName = s(row, "First Name");
    let lastName = s(row, "Last Name");
    if (!firstName && !lastName) {
      const full = s(row, "Customer Name");
      const parts = full.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    if (!firstName && !lastName) {
      skippedNoName++;
      continue;
    }

    const canceledDate = s(row, "Date Canceled Service");
    const isCanceled = canceledDate !== "";
    if (isCanceled) canceled++;

    const addressLine1 = s(row, "Street Address") || addressFromJobLocation(row);
    if (!addressLine1) noAddress++;

    const jobType = s(row, "Job Type");
    const recurrence = JOB_TYPE_TO_RECURRENCE[jobType] ?? null;
    recurrenceCounts[recurrence ?? "none"]++;
    if (!recurrence && jobType && !isCanceled) {
      unmappedJobTypes.set(jobType, (unmappedJobTypes.get(jobType) ?? 0) + 1);
    }

    const phone = s(row, "Cell Phone") || s(row, "Home Phone") || s(row, "Work Phone") || null;
    const petNotes = combine(row, [
      ["Dog", "Dog"],
      ["Cat", "Cat"],
      ["Pet hair", "Pet Hair"],
    ]);

    toImport++;

    if (!commit) continue;

    const [customer] = await db
      .insert(customers)
      .values({
        companyId: company.id,
        customerNumber: tcfId || null,
        salutation: s(row, "Salutation") || null,
        firstName: firstName || "(no first name)",
        lastName: lastName || "(no last name)",
        email: s(row, "Email") || null,
        phone,
        addressLine1,
        addressLine2: s(row, "Address 2") || null,
        city: s(row, "City") || null,
        state: s(row, "State") || null,
        zip: s(row, "Zip Code") || null,
        subdivision: s(row, "Subdivision") || null,
        serviceType: s(row, "Service Type") || null,
        paymentMethod: s(row, "Payment Method") || null,
        importantToCustomer: s(row, "Important to you!") || null,
        preferredCommunication: s(row, "Preferred Communication") || null,
        preferredDay: s(row, "Preferred Day") || null,
        preferredTime: s(row, "Preferred Time") || null,
        doNotClean: s(row, "Don't CLEAN") || null,
        petNotes,
        homeDetails: toHomeDetails(row, roomTypeIdByName),
        tags: toTags(row),
        textMessagingAllowed: /y|x|text/i.test(s(row, "Send Preference: Text")),
        notes: s(row, "Notes") || null,
        source: s(row, "Marketing Method") || null,
        status: isCanceled ? "lost" : "client",
        clientType: s(row, "Customer Type").toLowerCase().includes("commercial") ? "commercial" : "residential",
        recurrence,
        archivedReason: isCanceled ? `Cancelled in TheCustomerFactor (recorded: "${canceledDate}")` : null,
        archivedAt: null,
      })
      .returning();

    if (addressLine1) {
      await db.insert(customerLocations).values({
        companyId: company.id,
        customerId: customer.id,
        label: "Primary home",
        addressLine1,
        addressLine2: s(row, "Address 2") || null,
        city: s(row, "City") || null,
        state: s(row, "State") || null,
        zip: s(row, "Zip Code") || null,
        isPrimary: true,
        ...toLocationAccessFields(row),
      });
    }

    inserted++;
  }

  console.log(`Mode: ${commit ? "COMMIT (wrote to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Total rows in CSV: ${rows.length}  (distinct customers: ${byId.size}${noId.length ? ` + ${noId.length} with no Id` : ""})`);
  console.log(`Already imported (skipped): ${skippedExisting}`);
  console.log(`Skipped — no name at all: ${skippedNoName}`);
  console.log(`${commit ? "Inserted" : "Would import"}: ${commit ? inserted : toImport}`);
  console.log(`  of which cancelled in TCF -> status "lost": ${canceled}`);
  console.log(`  of which missing a street address (even after Job location fallback): ${noAddress}`);
  console.log(`Recurrence breakdown:`, recurrenceCounts);
  if (unmappedJobTypes.size) {
    console.log(`Job types with no frequency mapping (recurrence left null, needs manual review):`, Object.fromEntries(unmappedJobTypes));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
