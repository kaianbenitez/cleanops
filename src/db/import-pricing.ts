/**
 * Reads the company's "Quote Form" spreadsheet (2 tabs: Bartlesville, Tulsa)
 * and seeds serviceLocations, roomTypes, roomTypeServiceWeights, and
 * travelZones from it. Re-runnable if the source pricing sheet changes —
 * update FILE_PATH and re-run (note: this INSERTS, it doesn't upsert; if
 * re-running against an existing company, delete the old rows first or this
 * will duplicate them).
 *
 * Room-type service weights and the dirty-code discount tiers are read from
 * the Bartlesville tab only (confirmed identical to Tulsa's by inspection).
 * Hourly rate, minimums, and travel zones are read per-location since those
 * differ.
 *
 * IMPORTANT: ExcelJS returns `{ formula, result }` for formula cells, not a
 * plain number — use `readNumber()` for every numeric cell read, not a bare
 * `typeof === "number"` check, or formula-computed cells silently become 0.
 * (This bug shipped once already — see DECISIONS.md 2026-07-14 entry.)
 *
 * Run: `npx tsx src/db/import-pricing.ts`
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import ExcelJS from "exceljs";
import { db } from "./index";
import { companies, roomTypes, roomTypeServiceWeights, serviceLocations, travelZones } from "./schema";

const FILE_PATH = "C:\\Users\\kbeni\\Downloads\\Untitled spreadsheet (1).xlsx";

const SERVICE_TYPES = [
  "supreme_deep",
  "deep",
  "first_time",
  "weekly",
  "biweekly",
  "four_weeks",
  "move_in_out",
] as const;
// Column order in the source sheet's E2:K2 (minimums) and P5:V18 (weights)
const SERVICE_COLUMN_ORDER = SERVICE_TYPES;

function readNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v && typeof v.result === "number") {
    return v.result;
  }
  return 0;
}

function readString(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && "result" in v && typeof v.result === "string") {
    return v.result.trim() || null;
  }
  return null;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);

  const bartlesville = workbook.getWorksheet("Bartlesville");
  const tulsa = workbook.getWorksheet("Copy of Kaian - Tulsa");
  if (!bartlesville || !tulsa) throw new Error("Expected sheets not found in workbook");

  const [company] = await db.select().from(companies).limit(1);
  if (!company) throw new Error("No company found — run the main seed script first");

  // ---- Room types + weights (from Bartlesville, rows 5-18, cols O(name)/P-V(weights)) ----
  console.log("Importing room types + service weights...");
  const roomTypeNames: string[] = [];
  for (let row = 5; row <= 18; row++) {
    const name = readString(bartlesville.getCell(row, 15)); // col O
    if (name) roomTypeNames.push(name);
  }

  for (let i = 0; i < roomTypeNames.length; i++) {
    const name = roomTypeNames[i];
    const row = 5 + i;

    const [rt] = await db
      .insert(roomTypes)
      .values({ companyId: company.id, name, sortOrder: i })
      .returning();

    for (let col = 0; col < SERVICE_COLUMN_ORDER.length; col++) {
      const weightHours = readNumber(bartlesville.getCell(row, 16 + col)); // col P onward
      await db.insert(roomTypeServiceWeights).values({
        roomTypeId: rt.id,
        serviceType: SERVICE_COLUMN_ORDER[col],
        weightHours: weightHours.toFixed(3),
      });
    }
  }
  console.log(`  ${roomTypeNames.length} room types imported.`);

  // ---- Dirty code tiers (from Bartlesville O22:P25 -> level/discountPercent) ----
  const dirtyCodeTiers: { level: number; discountPercent: number }[] = [];
  for (let row = 22; row <= 25; row++) {
    const level = readNumber(bartlesville.getCell(row, 15)); // col O
    const discount = readNumber(bartlesville.getCell(row, 16)); // col P
    if (level > 0) dirtyCodeTiers.push({ level, discountPercent: discount });
  }
  console.log(`  Dirty code tiers: ${JSON.stringify(dirtyCodeTiers)}`);

  // ---- Service locations: Bartlesville ----
  console.log("Importing Bartlesville location...");
  const bartMinimums: Record<string, number> = {};
  for (let col = 0; col < SERVICE_COLUMN_ORDER.length; col++) {
    const cell = readNumber(bartlesville.getCell(2, 5 + col)); // row2, col E onward
    bartMinimums[SERVICE_COLUMN_ORDER[col]] = Math.round(cell * 100);
  }
  const bartHourly = readNumber(bartlesville.getCell(3, 26)); // Z3
  const [bartLocation] = await db
    .insert(serviceLocations)
    .values({
      companyId: company.id,
      name: "Bartlesville",
      hourlyRateCents: Math.round(bartHourly * 100),
      minimums: bartMinimums,
      dirtyCodeTiers,
    })
    .returning();

  // Bartlesville travel zones: town names col A20:A33(approx), mileage col AG22:AG35, fee = mileage*2
  let bzRow = 20;
  let zoneOrder = 0;
  while (true) {
    const name = readString(bartlesville.getCell(bzRow, 1));
    if (!name) break;
    const mileage = readNumber(bartlesville.getCell(bzRow + 2, 33)); // AG col, +2 row offset confirmed
    await db.insert(travelZones).values({
      serviceLocationId: bartLocation.id,
      name,
      feeCents: Math.round(mileage * 2 * 100),
      sortOrder: zoneOrder++,
    });
    bzRow++;
  }
  console.log(`  ${zoneOrder} Bartlesville travel zones imported.`);

  // ---- Service locations: Tulsa ----
  console.log("Importing Tulsa location...");
  const tulsaMinimums: Record<string, number> = {};
  for (let col = 0; col < SERVICE_COLUMN_ORDER.length; col++) {
    const cell = readNumber(tulsa.getCell(2, 5 + col));
    tulsaMinimums[SERVICE_COLUMN_ORDER[col]] = Math.round(cell * 100);
  }
  const tulsaHourly = readNumber(tulsa.getCell(3, 26));
  await db.insert(serviceLocations).values({
    companyId: company.id,
    name: "Tulsa",
    hourlyRateCents: Math.round(tulsaHourly * 100),
    minimums: tulsaMinimums,
    dirtyCodeTiers, // confirmed identical to Bartlesville's
  });

  // NOT importing Tulsa travel zones: the source sheet's formulas there are
  // internally inconsistent (e.g. AI30 references B37, AG30 references
  // AF30*AG22 — rows that don't correspond to the visible town/zip list),
  // which looks like a leftover artifact from copying/inserting rows without
  // updating references. Importing it would produce wrong travel fees on
  // real quotes. Tulsa's location record is created with hourly rate +
  // minimums only (those were clean, non-formula values) — add its travel
  // zones manually via Settings once that screen exists, or rebuild that
  // section of the source sheet and re-run this import.
  console.log("  Tulsa travel zones SKIPPED — source formulas are broken, see comment above.");

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
