/**
 * One-off backfill for customers already imported by import-tcf-customers.ts
 * before it correctly mapped room counts and access codes. Re-reads the same
 * TCF CSV and, for each customer already in the DB (matched by customerNumber),
 * updates:
 *   - customers.homeDetails -> { roomCounts, dirtLevel, clutterCode } keyed by
 *     this company's real room_type ids (previously stored raw TCF labels)
 *   - the customer's primary customerLocations row -> garageCode / gateCode /
 *     alarmCode / keyNumber / accessInstructions / vacuumLocation /
 *     mopHeadsNeeded / trashBags (previously only stranded in a
 *     customers.gateCodeOrKeyNotes field the UI never read)
 *
 * Usage:
 *   npx tsx work/backfill-tcf-home-details.ts "<path-to-csv>"            (dry run)
 *   npx tsx work/backfill-tcf-home-details.ts "<path-to-csv>" --commit
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import { parse } from "csv-parse/sync";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { companies, customers, customerLocations, roomTypes } from "../src/db/schema";

const csvPath = process.argv[2];
const commit = process.argv.includes("--commit");

if (!csvPath) {
  console.error("Usage: npx tsx work/backfill-tcf-home-details.ts <path-to-csv> [--commit]");
  process.exit(1);
}

type Row = Record<string, string>;

function s(row: Row, key: string): string {
  return (row[key] ?? "").trim();
}

const JOB_TYPE_TO_RECURRENCE: Record<string, string> = {
  "Weekly Cleaning Service": "weekly",
  "Bi-Weekly Cleaning Service": "biweekly",
  "Monthly (4 weeks) Cleaning Service": "every4weeks",
  "Monthly (1 Time a month)": "monthly",
  "Monthly (5 weeks) Cleaning Service": "monthly",
};

function pickPrimaryJobRow(rows: Row[]): Row {
  const recurring = rows.find((r) => s(r, "Job Type") in JOB_TYPE_TO_RECURRENCE);
  return recurring ?? rows[0];
}

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
const OTHER_ROOM_FIELDS = ["Theater/Game room", "Other"];

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
  if (!company) throw new Error("No company found");

  const companyRoomTypes = await db.select().from(roomTypes).where(eq(roomTypes.companyId, company.id));
  const roomTypeIdByName = new Map(companyRoomTypes.map((rt) => [rt.name, rt.id]));

  const byId = new Map<string, Row[]>();
  for (const row of rows) {
    const id = s(row, "Id");
    if (!id) continue;
    const group = byId.get(id) ?? [];
    group.push(row);
    byId.set(id, group);
  }

  let matched = 0;
  let notFound = 0;
  let homeDetailsUpdated = 0;
  let locationUpdated = 0;
  let noLocationRow = 0;

  for (const [tcfId, group] of byId) {
    const row = pickPrimaryJobRow(group);

    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, company.id), eq(customers.customerNumber, tcfId)))
      .limit(1);

    if (!customer) {
      notFound++;
      continue;
    }
    matched++;

    const homeDetails = toHomeDetails(row, roomTypeIdByName);
    const accessFields = toLocationAccessFields(row);

    if (commit) {
      await db.update(customers).set({ homeDetails, updatedAt: new Date() }).where(eq(customers.id, customer.id));
    }
    if (Object.keys(homeDetails).length) homeDetailsUpdated++;

    const [location] = await db
      .select({ id: customerLocations.id })
      .from(customerLocations)
      .where(and(eq(customerLocations.customerId, customer.id), eq(customerLocations.isPrimary, true)))
      .limit(1);

    if (!location) {
      noLocationRow++;
      continue;
    }

    if (commit) {
      await db.update(customerLocations).set({ ...accessFields, updatedAt: new Date() }).where(eq(customerLocations.id, location.id));
    }
    if (Object.values(accessFields).some(Boolean)) locationUpdated++;
  }

  console.log(`Mode: ${commit ? "COMMIT (wrote to DB)" : "DRY RUN (no writes)"}`);
  console.log(`Customers matched by TCF Id: ${matched}`);
  console.log(`Not found in DB (skipped): ${notFound}`);
  console.log(`Would update homeDetails for: ${homeDetailsUpdated}`);
  console.log(`Would update location access codes for: ${locationUpdated}`);
  console.log(`Matched customers with no primary location row: ${noLocationRow}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
