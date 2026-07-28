/**
 * Seeds one demo company with an admin, 3 employees, a service catalog,
 * 10 customers across the pipeline stages, a couple of recurring series,
 * and ~2 weeks of jobs (past + future) so every screen has data to show.
 *
 * Also creates 4 real Supabase auth accounts (via the service role key) so you
 * can log in immediately — no manual UUID-swapping step required.
 *
 * Login credentials (change passwords after your first login):
 *   admin@example.com / password123   (admin)
 *   maria@example.com / password123   (employee, hourly)
 *   chris@example.com / password123   (employee, hourly)
 *   dana@example.com  / password123   (employee, per-job %)
 *
 * Run with: npm run db:seed
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { db } from "./index";
import {
  companies,
  users,
  customers,
  services,
  recurringSeries,
  jobs,
  jobAssignments,
} from "./schema";

const SEED_PASSWORD = "password123";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Failed to create auth user ${email}: ${error.message}`);
  }
  return data.user.id;
}

function daysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding CleanOps demo data...");

  const [company] = await db
    .insert(companies)
    .values({
      name: "Sparkle Clean Co.",
      timezone: "America/Chicago",
      settings: {
        ghlTagMap: {
          quoteGiven: "quote-given",
          quoteAccepted: "quote-accepted",
          firstCleanBooked: "first-clean-booked",
          firstCleanDone: "first-clean-done",
          client: "client",
          lost: "lost",
          moved: "moved",
        },
      },
    })
    .returning();

  console.log("Creating Supabase auth accounts...");
  const adminId = await createAuthUser("admin@example.com");
  const employeeIds = [
    await createAuthUser("maria@example.com"),
    await createAuthUser("chris@example.com"),
    await createAuthUser("dana@example.com"),
  ];

  await db.insert(users).values([
    {
      id: adminId,
      companyId: company.id,
      role: "admin",
      firstName: "Jordan",
      lastName: "Owner",
      email: "admin@example.com",
      phone: "555-010-0001",
      title: "Owner",
      isActive: true,
    },
    {
      id: employeeIds[0],
      companyId: company.id,
      role: "employee",
      firstName: "Maria",
      lastName: "Lopez",
      email: "maria@example.com",
      phone: "555-010-0002",
      title: "Cleaning Tech (Primary)",
      gustoEmployeeId: "demo-001",
      payType: "commission_jth",
      hourlyRateCents: 1800, // fallback if payTiers is ever cleared
      payTiers: [
        { minHours: 0, maxHours: 25.99, rateCents: 1600 },
        { minHours: 26, maxHours: 29.99, rateCents: 1650 },
        { minHours: 30, maxHours: 33.99, rateCents: 1700 },
        { minHours: 34, maxHours: null, rateCents: 1750 },
      ],
      isActive: true,
    },
    {
      id: employeeIds[1],
      companyId: company.id,
      role: "employee",
      firstName: "Chris",
      lastName: "Nguyen",
      email: "chris@example.com",
      phone: "555-010-0003",
      title: "Cleaning Tech (Primary)",
      gustoEmployeeId: "demo-002",
      payType: "commission_jth",
      hourlyRateCents: 1900,
      isActive: true,
    },
    {
      id: employeeIds[2],
      companyId: company.id,
      role: "employee",
      firstName: "Dana",
      lastName: "Smith",
      email: "dana@example.com",
      phone: "555-010-0004",
      title: "Office Coordinator",
      gustoEmployeeId: "demo-003",
      payType: "office_hourly",
      hourlyRateCents: 2200,
      isActive: true,
    },
  ]);

  const [svcStandard, svcDeep] = await db
    .insert(services)
    .values([
      {
        companyId: company.id,
        name: "Standard Clean",
        description: "Recurring standard home cleaning",
        defaultPriceCents: 12000,
        defaultDurationMinutes: 120,
      },
      {
        companyId: company.id,
        name: "Deep Clean",
        description: "First-time or seasonal deep clean",
        defaultPriceCents: 25000,
        defaultDurationMinutes: 240,
      },
      {
        companyId: company.id,
        name: "Move-Out Clean",
        description: "End-of-lease cleaning",
        defaultPriceCents: 30000,
        defaultDurationMinutes: 300,
      },
    ])
    .returning();

  const customerSeed = [
    { firstName: "Alice", lastName: "Bennett", status: "lead", source: "google_ads" },
    { firstName: "Brian", lastName: "Carter", status: "quoted", source: "sms" },
    { firstName: "Cara", lastName: "Diaz", status: "first_clean_booked", source: "google_ads" },
    { firstName: "David", lastName: "Evans", status: "client", recurrence: "weekly", source: "referral" },
    { firstName: "Ella", lastName: "Foster", status: "client", recurrence: "biweekly", source: "google_ads" },
    { firstName: "Frank", lastName: "Garcia", status: "client", recurrence: "monthly", source: "sms" },
    { firstName: "Grace", lastName: "Harris", status: "lost", source: "google_ads" },
    { firstName: "Henry", lastName: "Ibrahim", status: "moved", source: "referral" },
    { firstName: "Ivy", lastName: "Jackson", status: "lead", source: "sms" },
    { firstName: "Jack", lastName: "Kim", status: "quoted", source: "google_ads" },
  ] as const;

  const insertedCustomers = await db
    .insert(customers)
    .values(
      customerSeed.map((c, i) => ({
        companyId: company.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
        phone: `555-020-${String(1000 + i).slice(-4)}`,
        addressLine1: `${100 + i} Main St`,
        city: "Springfield",
        state: "IL",
        zip: "62701",
        status: c.status,
        recurrence: "recurrence" in c ? c.recurrence : undefined,
        source: c.source,
        ghlContactId: `demo-ghl-${i + 1}`,
      }))
    )
    .returning();

  // Non-null: seeded above with literal defaultPriceCents values; only
  // custom add-on catalog entries can have a null price.
  const standardPriceCents = svcStandard.defaultPriceCents ?? 0;
  const deepPriceCents = svcDeep.defaultPriceCents ?? 0;

  const clients = insertedCustomers.filter((c) => c.status === "client");

  // Two recurring series for the weekly + biweekly clients
  const [seriesWeekly, seriesBiweekly] = await db
    .insert(recurringSeries)
    .values([
      {
        companyId: company.id,
        customerId: clients[0].id, // David, weekly
        frequency: "weekly",
        dayOfWeek: 2, // Tuesday
        startDate: daysFromToday(-30),
        priceCents: standardPriceCents,
        defaultEmployeeIds: [employeeIds[0]],
      },
      {
        companyId: company.id,
        customerId: clients[1].id, // Ella, biweekly
        frequency: "biweekly",
        dayOfWeek: 4, // Thursday
        startDate: daysFromToday(-30),
        priceCents: standardPriceCents,
        defaultEmployeeIds: [employeeIds[1]],
      },
    ])
    .returning();

  // ~2 weeks of jobs: some past+completed (for payroll demo data), some upcoming
  const jobRows = [
    // past completed jobs (last week) — feeds payroll screen
    { customerId: clients[0].id, seriesId: seriesWeekly.id, date: daysFromToday(-7), status: "completed", type: "recurring", price: standardPriceCents, employee: employeeIds[0] },
    { customerId: clients[1].id, seriesId: seriesBiweekly.id, date: daysFromToday(-5), status: "completed", type: "recurring", price: standardPriceCents, employee: employeeIds[1] },
    { customerId: clients[2].id, seriesId: null, date: daysFromToday(-3), status: "completed", type: "one_time", price: deepPriceCents, employee: employeeIds[2] },
    // today / upcoming
    { customerId: clients[0].id, seriesId: seriesWeekly.id, date: daysFromToday(0), status: "scheduled", type: "recurring", price: standardPriceCents, employee: employeeIds[0] },
    { customerId: insertedCustomers[2].id, seriesId: null, date: daysFromToday(1), status: "scheduled", type: "first_clean", price: deepPriceCents, employee: employeeIds[1] },
    { customerId: clients[1].id, seriesId: seriesBiweekly.id, date: daysFromToday(9), status: "scheduled", type: "recurring", price: standardPriceCents, employee: employeeIds[1] },
  ] as const;

  for (const j of jobRows) {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId: company.id,
        customerId: j.customerId,
        recurringSeriesId: j.seriesId ?? undefined,
        type: j.type,
        status: j.status,
        scheduledDate: j.date,
        scheduledStartTime: "09:00:00",
        estimatedDurationMinutes: 120,
        priceCents: j.price,
        completedAt: j.status === "completed" ? new Date() : undefined,
      })
      .returning();

    await db.insert(jobAssignments).values({
      jobId: job.id,
      userId: j.employee,
      role: "lead",
    });
  }

  console.log("\nSeed complete.");
  console.log("Company:", company.id);
  console.log("\nLog in at /login with:");
  console.log("  admin@example.com / password123  (admin)");
  console.log("  maria@example.com / password123  (employee)");
  console.log("  chris@example.com / password123  (employee)");
  console.log("  dana@example.com  / password123  (employee)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
