import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const sql = postgres(process.env.DATABASE_URL);

function daysFromToday(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const [company] = await sql`select id from companies limit 1`;
if (!company) throw new Error("No company found — run npm run db:seed first.");
const companyId = company.id;

const [employee] = await sql`select id, first_name, last_name from users where role = 'employee' limit 1`;
if (!employee) throw new Error("No employee user found.");

const customerSeed = [
  { firstName: "Alice", lastName: "Bennett", address: "412 Maple Ave", city: "Tulsa", state: "OK", zip: "74103" },
  { firstName: "Ben", lastName: "Carter", address: "88 Cedar Ct", city: "Tulsa", state: "OK", zip: "74104" },
  { firstName: "Priya", lastName: "Desai", address: "215 Birch St", city: "Bartlesville", state: "OK", zip: "74003" },
  { firstName: "Marcus", lastName: "Evans", address: "77 Willow Ln", city: "Tulsa", state: "OK", zip: "74105" },
];

const customerIds = [];
for (const c of customerSeed) {
  const [row] = await sql`
    insert into customers (id, company_id, first_name, last_name, email, phone, address_line1, city, state, zip, status, preferred_communication, important_to_customer, pet_notes)
    values (${randomUUID()}, ${companyId}, ${c.firstName}, ${c.lastName}, ${c.firstName.toLowerCase() + "." + c.lastName.toLowerCase() + "@example.com"}, ${"918-555-" + (1000 + customerIds.length)}, ${c.address}, ${c.city}, ${c.state}, ${c.zip}, 'client', 'text', 'Please text 15 min before arrival', 'Friendly dog, stays in backyard')
    returning id
  `;
  const customerId = row.id;
  customerIds.push(customerId);
  await sql`
    insert into customer_locations (id, company_id, customer_id, label, address_line1, city, state, zip, is_primary, is_active, access_instructions, garage_code)
    values (${randomUUID()}, ${companyId}, ${customerId}, 'Primary home', ${c.address}, ${c.city}, ${c.state}, ${c.zip}, true, true, 'Key under the mat by the side door', '4521')
  `;
}

const jobSeed = [
  { customerId: customerIds[0], date: daysFromToday(0), time: "08:00:00", status: "completed", type: "recurring", completed: true },
  { customerId: customerIds[1], date: daysFromToday(0), time: "10:30:00", status: "scheduled", type: "recurring", completed: false },
  { customerId: customerIds[2], date: daysFromToday(0), time: "13:30:00", status: "scheduled", type: "deep_clean", completed: false },
  { customerId: customerIds[3], date: daysFromToday(1), time: "09:00:00", status: "scheduled", type: "one_time", completed: false },
];

for (const j of jobSeed) {
  const [job] = await sql`
    insert into jobs (id, company_id, customer_id, type, status, scheduled_date, scheduled_start_time, estimated_duration_minutes, price_cents, completed_at)
    values (${randomUUID()}, ${companyId}, ${j.customerId}, ${j.type}, ${j.status}, ${j.date}, ${j.time}, 120, 15000, ${j.completed ? new Date() : null})
    returning id
  `;
  await sql`
    insert into job_assignments (id, job_id, user_id, role)
    values (${randomUUID()}, ${job.id}, ${employee.id}, 'lead')
  `;
}

console.log(`Seeded 4 customers + 4 jobs for ${employee.first_name} ${employee.last_name} (today + tomorrow).`);
await sql.end();
