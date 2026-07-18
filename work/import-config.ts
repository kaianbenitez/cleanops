import postgres from "postgres";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const dump = JSON.parse(fs.readFileSync("work/config-export.json", "utf-8"));

  const [existing] = await sql`select count(*) as count from companies`;
  if (Number(existing.count) > 0) {
    throw new Error("companies table is not empty — refusing to import into a non-fresh database");
  }

  const c = dump.company;
  await sql`
    insert into companies (id, name, timezone, settings)
    values (${c.id}, ${c.name}, ${c.timezone}, ${sql.json(c.settings)})
  `;

  for (const sl of dump.serviceLocations) {
    await sql`
      insert into service_locations (id, company_id, name, hourly_rate_cents, minimums, dirty_code_tiers, is_active, created_at, updated_at)
      values (${sl.id}, ${sl.company_id}, ${sl.name}, ${sl.hourly_rate_cents}, ${sql.json(sl.minimums)}, ${sql.json(sl.dirty_code_tiers)}, ${sl.is_active}, ${sl.created_at}, ${sl.updated_at})
    `;
  }

  for (const tz of dump.travelZones) {
    await sql`
      insert into travel_zones (id, service_location_id, name, fee_cents, sort_order, created_at, updated_at)
      values (${tz.id}, ${tz.service_location_id}, ${tz.name}, ${tz.fee_cents}, ${tz.sort_order}, ${tz.created_at}, ${tz.updated_at})
    `;
  }

  for (const rt of dump.roomTypes) {
    await sql`
      insert into room_types (id, company_id, name, sort_order, created_at, updated_at)
      values (${rt.id}, ${rt.company_id}, ${rt.name}, ${rt.sort_order}, ${rt.created_at}, ${rt.updated_at})
    `;
  }

  for (const w of dump.roomTypeWeights) {
    await sql`
      insert into room_type_service_weights (id, room_type_id, service_type, weight_hours, created_at, updated_at)
      values (${w.id}, ${w.room_type_id}, ${w.service_type}, ${w.weight_hours}, ${w.created_at}, ${w.updated_at})
    `;
  }

  for (const svc of dump.services) {
    await sql`
      insert into services (id, company_id, name, description, default_price_cents, default_duration_minutes, is_active, created_at, updated_at)
      values (${svc.id}, ${svc.company_id}, ${svc.name}, ${svc.description}, ${svc.default_price_cents}, ${svc.default_duration_minutes}, ${svc.is_active}, ${svc.created_at}, ${svc.updated_at})
    `;
  }

  console.log("Imported:", {
    company: c.name,
    serviceLocations: dump.serviceLocations.length,
    travelZones: dump.travelZones.length,
    roomTypes: dump.roomTypes.length,
    roomTypeWeights: dump.roomTypeWeights.length,
    services: dump.services.length,
  });

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
