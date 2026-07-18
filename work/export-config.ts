import postgres from "postgres";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const [company] = await sql`select id, name, timezone, settings from companies where name = 'Simply Maid'`;
  const serviceLocations = await sql`select * from service_locations where company_id = ${company.id}`;
  const travelZones = await sql`select tz.* from travel_zones tz join service_locations sl on tz.service_location_id = sl.id where sl.company_id = ${company.id}`;
  const roomTypes = await sql`select * from room_types where company_id = ${company.id}`;
  const roomTypeWeights = await sql`select w.* from room_type_service_weights w join room_types rt on w.room_type_id = rt.id where rt.company_id = ${company.id}`;
  const services = await sql`select * from services where company_id = ${company.id}`;

  const dump = { company, serviceLocations, travelZones, roomTypes, roomTypeWeights, services };
  fs.writeFileSync("work/config-export.json", JSON.stringify(dump, null, 2));
  console.log("Exported:", {
    company: company.name,
    serviceLocations: serviceLocations.length,
    travelZones: travelZones.length,
    roomTypes: roomTypes.length,
    roomTypeWeights: roomTypeWeights.length,
    services: services.length,
  });

  await sql.end();
}

main();
