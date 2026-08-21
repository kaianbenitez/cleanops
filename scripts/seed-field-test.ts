/**
 * Local/dev-only fixtures for manually exercising My Day during WP-F work and
 * for Jaelie's field-test dry runs on a laptop before she takes it to her
 * phone. NEVER touches hosted data — see the host check below.
 *
 * Idempotent: re-running this script is always safe. It finds-or-creates one
 * fixed company and three fixed employees (by email), then wipes and
 * rebuilds *only* today's jobs for that company before re-inserting a fresh
 * five-stop day. Nothing outside this script's own fixture company is ever
 * touched.
 *
 * Creates:
 *   - one company ("WP-F Field Test Co", America/Chicago)
 *   - three employees: the tester, a coworker, and a third with zero stops
 *     today (the "0 stops" / day_complete case from packet §11)
 *   - a five-stop day for the tester, today, covering: a solo stop, a
 *     two-person stop (with the coworker), a stop with no address, a stop
 *     with no scheduled time, and a stop with long name/address/instructions
 *     content (for the 320px/390px browser layout checks)
 *
 * Run with: npx tsx scripts/seed-field-test.ts
 * (there is deliberately no package.json script entry — WP-F does not own
 * package.json)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "../src/db";
import { usernameToEmail } from "../src/lib/auth/username";
import {
  companies,
  customerLocations,
  customers,
  jobAssignments,
  jobs,
  timeEntries,
  users,
} from "../src/db/schema";

const SEED_PASSWORD = "password123";

const COMPANY_NAME = "WP-F Field Test Co";
// Real login identity is `<username>@cleanops.local` (src/lib/auth/username.ts)
// — the login page takes the username half, not the full email.
const EMPLOYEE_USERNAME = "wpffieldtester";
const COWORKER_USERNAME = "wpffieldcoworker";
const EMPTYDAY_USERNAME = "wpffieldemptyday";
const EMPLOYEE_EMAIL = usernameToEmail(EMPLOYEE_USERNAME);
const COWORKER_EMAIL = usernameToEmail(COWORKER_USERNAME);
const EMPTYDAY_EMAIL = usernameToEmail(EMPTYDAY_USERNAME);

// Tags fixture customers so reruns can find-and-wipe exactly these rows,
// never anyone else's data.
const CUSTOMER_TAG = "wp-f-field-test-fixture";

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.error("seed-field-test: DATABASE_URL is not set. Aborting.");
    process.exit(2);
  }
  let host = "";
  try {
    // `postgresql://user:pass@host:port/db` — new URL() handles this scheme fine.
    host = new URL(url).hostname;
  } catch {
    console.error(`seed-field-test: could not parse DATABASE_URL to check its host. Aborting rather than guessing.\n  ${url}`);
    process.exit(2);
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  if (!isLocal) {
    console.error(
      `seed-field-test: REFUSING TO RUN.\n` +
        `  DATABASE_URL points at "${host}", which is not a local database.\n` +
        `  This script writes and deletes fixture data and must never touch the\n` +
        `  hosted project. Point DATABASE_URL at your local Supabase instance\n` +
        `  (npm run supabase:start; typically 127.0.0.1:54322) and try again.`
    );
    process.exit(1);
  }
}

async function findOrCreateAuthUser(supabaseAdmin: SupabaseClient, email: string): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`seed-field-test: failed to create auth user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  assertLocalDatabase();

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`seed-field-test: target host is local — proceeding against ${new URL(process.env.DATABASE_URL!).hostname || "(unix socket)"}`);

  let [company] = await db.select().from(companies).where(eq(companies.name, COMPANY_NAME)).limit(1);
  if (!company) {
    [company] = await db.insert(companies).values({ name: COMPANY_NAME, timezone: "America/Chicago" }).returning();
    console.log("Created company:", company.id);
  } else {
    console.log("Reusing company:", company.id);
  }

  const employeeId = await findOrCreateAuthUser(supabaseAdmin, EMPLOYEE_EMAIL);
  const coworkerId = await findOrCreateAuthUser(supabaseAdmin, COWORKER_EMAIL);
  const emptydayId = await findOrCreateAuthUser(supabaseAdmin, EMPTYDAY_EMAIL);

  await db
    .insert(users)
    .values([
      { id: employeeId, companyId: company.id, role: "employee", firstName: "Jaelie", lastName: "Fieldtest", email: EMPLOYEE_EMAIL, payType: "commission_jth", isActive: true },
      { id: coworkerId, companyId: company.id, role: "employee", firstName: "Corey", lastName: "Coworker", email: COWORKER_EMAIL, payType: "commission_jth", isActive: true },
      { id: emptydayId, companyId: company.id, role: "employee", firstName: "Emma", lastName: "Emptyday", email: EMPTYDAY_EMAIL, payType: "commission_jth", isActive: true },
    ])
    .onConflictDoNothing({ target: users.id });

  // ---- wipe this fixture's prior jobs/customers so reruns don't pile up ----
  const staleCustomers = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.companyId, company.id), eq(customers.source, CUSTOMER_TAG)));
  const staleCustomerIds = staleCustomers.map((c) => c.id);

  if (staleCustomerIds.length > 0) {
    const staleJobs = await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.customerId, staleCustomerIds));
    const staleJobIds = staleJobs.map((j) => j.id);
    if (staleJobIds.length > 0) {
      await db.delete(timeEntries).where(inArray(timeEntries.jobId, staleJobIds));
      await db.delete(jobAssignments).where(inArray(jobAssignments.jobId, staleJobIds));
      await db.delete(jobs).where(inArray(jobs.id, staleJobIds));
    }
    await db.delete(customerLocations).where(inArray(customerLocations.customerId, staleCustomerIds));
    await db.delete(customers).where(inArray(customers.id, staleCustomerIds));
  }

  // ---- five stops, today, for Jaelie Fieldtest ----
  const longName = { firstName: "Bartholomew-Alessandro", lastName: "Featherstonehaugh-Worthington-Pemberton" }; // 60 chars combined
  const longAddress = "4821 Northwestern Cross-Timbers Boulevard, Building C, Suite 1408"; // ~66 chars; padded below
  const longAddressPadded = `${longAddress}, Historic District Annex`; // ~90 chars
  const longInstructions =
    "Use the side gate by the mailbox, not the front — it sticks, lift up while pulling. Dog is friendly but loud, please close the office door behind you so he doesn't get into the kitchen. Alarm code is on the fridge, not the panel.";

  const customerSeed = [
    { key: "solo", firstName: "Solo", lastName: "Stop", time: "08:00:00", address: "12 Oak Ln", crew: [employeeId] },
    { key: "crew", firstName: "Crew", lastName: "Stop", time: "09:45:00", address: "34 Maple Ave", crew: [employeeId, coworkerId] },
    { key: "noaddr", firstName: "Noaddress", lastName: "Stop", time: "11:15:00", address: null, crew: [employeeId] },
    { key: "notime", firstName: "Notime", lastName: "Stop", time: null, address: "78 Birch Ct", crew: [employeeId] },
    { key: "long", firstName: longName.firstName, lastName: longName.lastName, time: "14:30:00", address: longAddressPadded, crew: [employeeId] },
  ] as const;

  const insertedCustomers = await db
    .insert(customers)
    .values(
      customerSeed.map((c) => ({
        companyId: company.id,
        firstName: c.firstName,
        lastName: c.lastName,
        addressLine1: c.address,
        city: c.address ? "Tulsa" : null,
        state: c.address ? "OK" : null,
        source: CUSTOMER_TAG,
        status: "client" as const,
      }))
    )
    .returning();

  for (const [i, c] of customerSeed.entries()) {
    const customer = insertedCustomers[i];
    if (c.address) {
      await db.insert(customerLocations).values({
        companyId: company.id,
        customerId: customer.id,
        addressLine1: c.address,
        city: "Tulsa",
        state: "OK",
        zip: "74103",
        isPrimary: true,
        isActive: true,
        accessInstructions: c.key === "long" ? longInstructions : null,
      });
    }

    const [job] = await db
      .insert(jobs)
      .values({
        companyId: company.id,
        customerId: customer.id,
        type: "recurring",
        status: "scheduled",
        scheduledDate: todayIso(),
        scheduledStartTime: c.time,
        estimatedDurationMinutes: 120,
        priceCents: 12000,
      })
      .returning();

    for (const userId of c.crew) {
      await db.insert(jobAssignments).values({ jobId: job.id, userId, role: "lead" });
    }
  }

  console.log("\nSeed complete.");
  console.log("Company:", company.id);
  console.log("Log in at /login with (password: %s):", SEED_PASSWORD);
  console.log(`  ${EMPLOYEE_USERNAME} — Jaelie Fieldtest, today's 5-stop route`);
  console.log(`  ${COWORKER_USERNAME} — Corey Coworker, shares the "Crew Stop"`);
  console.log(`  ${EMPTYDAY_USERNAME} — Emma Emptyday, zero stops today (day_complete / 0-stops case)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
