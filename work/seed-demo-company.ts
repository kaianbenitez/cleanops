/**
 * One-time seed for a fully isolated, deliberately fake demo tenant.
 *
 * Usage:
 *   npx tsx work/seed-demo-company.ts           (dry run; no writes)
 *   npx tsx work/seed-demo-company.ts --apply   (creates the demo tenant and its data)
 *
 * This script only inserts rows belonging to DEMO_COMPANY_NAME. It never reads
 * from or modifies the Simply Maid company or any of its operational data.
 */
import { config } from "dotenv";
import { randomUUID } from "crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { generateTemporaryPassword, slugifyUsername, usernameToEmail } from "../src/lib/auth/username";

config({ path: ".env.local" });

const DEMO_COMPANY_NAME = "Demo Cleaning Co. — Fictional Training Tenant";
const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const isoDate = (offset: number) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const customerSeed = [
  { firstName: "Avery", lastName: "Barton", status: "lead", source: "Demo web form" },
  { firstName: "Casey", lastName: "Dover", status: "lead", source: "Demo referral" },
  { firstName: "Riley", lastName: "Ellis", status: "quoted", source: "Demo Google search" },
  { firstName: "Morgan", lastName: "Frost", status: "quoted", source: "Demo neighborhood flyer" },
  { firstName: "Jordan", lastName: "Gray", status: "first_clean_booked", source: "Demo returning inquiry" },
  { firstName: "Taylor", lastName: "Hale", status: "client", recurrence: "weekly", source: "Demo referral" },
  { firstName: "Cameron", lastName: "Ives", status: "client", recurrence: "biweekly", source: "Demo web form" },
  { firstName: "Quinn", lastName: "Jasper", status: "client", recurrence: "every4weeks", source: "Demo Google search" },
  { firstName: "Parker", lastName: "Knoll", status: "client", recurrence: "monthly", source: "Demo referral" },
  { firstName: "Skyler", lastName: "Linden", status: "client", recurrence: "none", source: "Demo phone inquiry" },
  { firstName: "Emerson", lastName: "Marlow", status: "lost", source: "Demo web form" },
  { firstName: "Reese", lastName: "North", status: "lost", source: "Demo referral" },
  { firstName: "Blair", lastName: "Oak", status: "moved", source: "Demo Google search" },
  { firstName: "Sage", lastName: "Perry", status: "moved", source: "Demo neighborhood flyer" },
] as const;

const accountSeed = [
  { firstName: "Drew", lastName: "DemoAdmin", role: "admin" as const, isFieldStaff: false, title: "Demo Company Administrator" },
  { firstName: "Harper", lastName: "Hourly", role: "employee" as const, isFieldStaff: false, title: "Demo Cleaning Technician", payType: "office_hourly", hourlyRateCents: 2250 },
  { firstName: "Rowan", lastName: "Commission", role: "employee" as const, isFieldStaff: false, title: "Demo Lead Cleaning Technician", payType: "commission_jth", hourlyRateCents: 2400, payTiers: [{ minHours: 0, maxHours: 19.99, rateCents: 2400 }, { minHours: 20, maxHours: 34.99, rateCents: 2600 }, { minHours: 35, maxHours: null, rateCents: 2800 }] },
];

async function main() {
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  const existing = await sql`select id from companies where name = ${DEMO_COMPANY_NAME} limit 1`;
  console.log(`Mode: ${apply ? "APPLY (will write to DB and Supabase Auth)" : "DRY RUN (no writes)"}`);
  if (existing.length) throw new Error(`Refusing to run: company \"${DEMO_COMPANY_NAME}\" already exists (${existing[0].id}). No changes were made.`);

  console.log(`Would create company: ${DEMO_COMPANY_NAME}`);
  console.log(`Would create accounts: ${accountSeed.map((account) => usernameToEmail(slugifyUsername(account.firstName, account.lastName))).join(", ")}`);
  console.log("Would create: 5 services (3 main, 2 add-on), 14 customers, 2 recurring series, 18 jobs, 2 quotes, 1 invoice, 1 payroll period, and 2 non-zero payroll lines.");
  console.log("All addresses, phone numbers, emails, and notes are fictional demo data. Integration credentials and GHL settings will remain unset.");
  if (!apply) {
    console.log("Dry run complete. Re-run with --apply to create this isolated demo tenant.");
    await sql.end();
    return;
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const credentials = accountSeed.map((account) => ({ ...account, username: slugifyUsername(account.firstName, account.lastName), email: usernameToEmail(slugifyUsername(account.firstName, account.lastName)), password: generateTemporaryPassword(), id: "" }));
  const createdAuthIds: string[] = [];

  try {
    for (const account of credentials) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (error || !data.user) throw new Error(`Could not create auth account ${account.email}: ${error?.message ?? "unknown error"}`);
      account.id = data.user.id;
      createdAuthIds.push(data.user.id);
    }

    await sql.begin(async (tx) => {
      const duplicate = await tx`select id from companies where name = ${DEMO_COMPANY_NAME} limit 1`;
      if (duplicate.length) throw new Error(`Refusing to run: company \"${DEMO_COMPANY_NAME}\" appeared during setup. No database rows were inserted.`);

      const [company] = await tx`insert into companies (name, timezone, settings) values (${DEMO_COMPANY_NAME}, 'America/Chicago', '{}'::jsonb) returning id`;
      const hourly = credentials[1];
      const commission = credentials[2];
      await tx`insert into users ${tx(credentials.map((account) => ({
        id: account.id, company_id: company.id, role: account.role, is_field_staff: account.isFieldStaff,
        first_name: account.firstName, last_name: account.lastName, email: account.email, title: account.title,
        hired_date: isoDate(-60), pay_type: account.payType ?? null, hourly_rate_cents: account.hourlyRateCents ?? null,
        pay_tiers: account.payTiers ? JSON.stringify(account.payTiers) : null, is_active: true, must_change_password: true,
      })))}`;

      const [addOnFridge, addOnOven] = await tx`insert into services ${tx([
        { company_id: company.id, category: "add_on", name: "Inside Refrigerator", description: "Fictional demo add-on: shelves and drawers", default_price_cents: 3500, price_label: "$35", default_duration_minutes: 30, available_add_on_ids: JSON.stringify([]), is_active: true },
        { company_id: company.id, category: "add_on", name: "Inside Oven", description: "Fictional demo add-on: interior oven clean", default_price_cents: 4500, price_label: "$45", default_duration_minutes: 45, available_add_on_ids: JSON.stringify([]), is_active: true },
      ])} returning id`;
      const [standard, deep, moveOut] = await tx`insert into services ${tx([
        { company_id: company.id, category: "main", name: "Demo Standard Clean", description: "Fictional recurring home-cleaning service", default_price_cents: 14500, price_label: "From $145", default_duration_minutes: 150, available_add_on_ids: JSON.stringify([addOnFridge.id, addOnOven.id]), is_active: true },
        { company_id: company.id, category: "main", name: "Demo Deep Clean", description: "Fictional detailed first-visit service", default_price_cents: 28500, price_label: "From $285", default_duration_minutes: 270, available_add_on_ids: JSON.stringify([addOnFridge.id, addOnOven.id]), is_active: true },
        { company_id: company.id, category: "main", name: "Demo Move-Out Clean", description: "Fictional empty-home turnover service", default_price_cents: 36000, price_label: "From $360", default_duration_minutes: 360, available_add_on_ids: JSON.stringify([addOnFridge.id, addOnOven.id]), is_active: true },
      ])} returning id`;

      const customerRows = await tx`insert into customers ${tx(customerSeed.map((customer, index) => ({
        company_id: company.id, first_name: customer.firstName, last_name: customer.lastName,
        email: `${customer.firstName.toLowerCase()}.${customer.lastName.toLowerCase()}@example.com`, phone: `555-01${String(index + 10).padStart(2, "0")}`,
        address_line1: `${100 + index} Fictional Demo Lane`, city: "Sampleville", state: "IL", zip: "0000" + (index + 1), county: "Example County", subdivision: "Training Meadows",
        gate_code_or_key_notes: index % 3 === 0 ? `Demo gate code ${1000 + index}; use side entry.` : null,
        important_to_customer: index % 2 === 0 ? "Fictional note: please leave the demo welcome mat straight." : null,
        do_not_clean: index % 3 === 1 ? "Fictional note: do not clean the display shelf." : null,
        pet_notes: index % 2 === 0 ? "Fictional pet note: friendly demo cat named Pixel." : null,
        home_details: JSON.stringify({ bedrooms: 2 + (index % 4), bathrooms: 1 + (index % 3), halfBathrooms: index % 2, kitchens: 1, livingRooms: 1 + (index % 2), offices: index % 3, laundryRooms: 1 }),
        mop_head_count: 2 + (index % 3), rag_count: 8 + index, vacuum_count: 1 + (index % 2),
        operational_notes: "Fictional training data only — no real home or customer.", general_notes: index % 2 === 0 ? "Fictional home detail: garage keypad is for demo testing only." : null,
        tags: JSON.stringify(["demo-data"]), text_messaging_allowed: false, status: customer.status, recurrence: "recurrence" in customer ? customer.recurrence : null, client_type: "residential", source: customer.source,
      }))) } returning id, first_name, last_name, status`;
      const findCustomer = (lastName: string) => customerRows.find((row) => row.last_name === lastName)!;
      const hale = findCustomer("Hale");
      const ives = findCustomer("Ives");
      const jasper = findCustomer("Jasper");
      const gray = findCustomer("Gray");
      const ellis = findCustomer("Ellis");

      const [weeklySeries, biweeklySeries] = await tx`insert into recurring_series ${tx([
        { company_id: company.id, customer_id: hale.id, frequency: "weekly", day_of_week: 2, start_date: isoDate(-21), price_cents: 14500, estimated_duration_minutes: 150, default_employee_ids: JSON.stringify([commission.id]), is_active: true },
        { company_id: company.id, customer_id: ives.id, frequency: "biweekly", day_of_week: 4, start_date: isoDate(-28), price_cents: 16500, estimated_duration_minutes: 180, default_employee_ids: JSON.stringify([hourly.id, commission.id]), is_active: true },
      ])} returning id`;

      const [sentQuote, acceptedQuote] = await tx`insert into quotes ${tx([
        { company_id: company.id, customer_id: ellis.id, status: "sent", public_token: randomUUID(), requested_service_type: "deep", room_counts: JSON.stringify([]), all_tier_pricing: JSON.stringify({}), total_cents: 28500, notes_to_customer: "Fictional pending proposal for demo review.", valid_until: isoDate(14), sent_at: new Date() },
        { company_id: company.id, customer_id: gray.id, status: "accepted", public_token: randomUUID(), requested_service_type: "first_time", accepted_service_type: "first_time", room_counts: JSON.stringify([]), all_tier_pricing: JSON.stringify({}), total_cents: 24000, notes_to_customer: "Fictional accepted proposal for demo review.", valid_until: isoDate(7), sent_at: new Date(Date.now() - 5 * 86400000), accepted_at: new Date(Date.now() - 3 * 86400000), signature_name: "Jordan Gray (Demo)", signature_at: new Date(Date.now() - 3 * 86400000) },
      ])} returning id`;

      const jobPlans = [
        { customerId: hale.id, seriesId: weeklySeries.id, offset: -14, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id, helper: hourly.id },
        { customerId: ives.id, seriesId: biweeklySeries.id, offset: -13, status: "completed", type: "recurring", price: 16500, duration: 180, serviceId: standard.id, lead: hourly.id, helper: commission.id },
        { customerId: jasper.id, offset: -12, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: gray.id, offset: -11, status: "completed", type: "first_clean", price: 24000, duration: 240, serviceId: deep.id, quoteId: acceptedQuote.id, lead: hourly.id, helper: commission.id },
        { customerId: hale.id, seriesId: weeklySeries.id, offset: -7, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: ives.id, seriesId: biweeklySeries.id, offset: -6, status: "completed", type: "recurring", price: 16500, duration: 180, serviceId: standard.id, lead: hourly.id },
        { customerId: jasper.id, offset: -5, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id, helper: hourly.id },
        { customerId: hale.id, seriesId: weeklySeries.id, offset: 0, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: ives.id, seriesId: biweeklySeries.id, offset: -3, status: "completed", type: "recurring", price: 16500, duration: 180, serviceId: standard.id, lead: hourly.id, helper: commission.id },
        { customerId: jasper.id, offset: -2, status: "completed", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: gray.id, offset: 0, status: "scheduled", type: "first_clean", price: 24000, duration: 240, serviceId: deep.id, quoteId: acceptedQuote.id, lead: hourly.id, helper: commission.id },
        { customerId: hale.id, seriesId: weeklySeries.id, offset: 7, status: "scheduled", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: ives.id, seriesId: biweeklySeries.id, offset: 4, status: "scheduled", type: "recurring", price: 16500, duration: 180, serviceId: standard.id, lead: hourly.id, helper: commission.id },
        { customerId: jasper.id, offset: 5, status: "scheduled", type: "recurring", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
        { customerId: findCustomer("Knoll").id, offset: 6, status: "scheduled", type: "recurring", price: 15500, duration: 165, serviceId: standard.id, lead: hourly.id },
        { customerId: findCustomer("Perry").id, offset: 3, status: "cancelled", type: "move_out", price: 36000, duration: 360, serviceId: moveOut.id, lead: commission.id, cancellationReason: "Fictional demo cancellation — customer changed plans." },
        { customerId: ellis.id, offset: 2, status: "scheduled", type: "deep_clean", price: 28500, duration: 270, serviceId: deep.id, quoteId: sentQuote.id, lead: hourly.id, helper: commission.id },
        { customerId: findCustomer("Linden").id, offset: 1, status: "scheduled", type: "one_time", price: 14500, duration: 150, serviceId: standard.id, lead: commission.id },
      ];
      const completedJobs: Array<{ id: string; lead: string; duration: number }> = [];
      for (const [index, plan] of jobPlans.entries()) {
        const [job] = await tx`insert into jobs (company_id, customer_id, quote_id, recurring_series_id, service_id, add_on_ids, type, status, scheduled_date, scheduled_start_time, estimated_duration_minutes, price_cents, cancellation_reason, completion_notes, cleaner_notes, completed_at, payment_method_collected)
          values (${company.id}, ${plan.customerId}, ${plan.quoteId ?? null}, ${plan.seriesId ?? null}, ${plan.serviceId}, ${JSON.stringify(index % 4 === 0 ? [addOnFridge.id] : [])}::jsonb, ${plan.type}, ${plan.status}, ${isoDate(plan.offset)}, ${index % 2 ? "10:00:00" : "08:30:00"}, ${plan.duration}, ${plan.price}, ${plan.cancellationReason ?? null}, ${plan.status === "completed" ? "Fictional demo clean completed successfully." : null}, ${plan.status === "completed" ? "Demo field note: all requested areas completed." : null}, ${plan.status === "completed" ? new Date(Date.now() + plan.offset * 86400000) : null}, ${plan.status === "completed" ? "not_collected" : null}) returning id`;
        await tx`insert into job_assignments ${tx([{ job_id: job.id, user_id: plan.lead, role: "lead" }, ...(plan.helper ? [{ job_id: job.id, user_id: plan.helper, role: "helper" }] : [])])}`;
        if (plan.status === "completed") {
          const clockIn = new Date(`${isoDate(plan.offset)}T14:00:00.000Z`);
          const clockOut = new Date(clockIn.getTime() + plan.duration * 60000);
          await tx`insert into time_entries (job_id, user_id, clock_in, clock_out, minutes_worked, notes) values (${job.id}, ${plan.lead}, ${clockIn}, ${clockOut}, ${plan.duration}, 'Fictional completed-job time entry.')`;
          completedJobs.push({ id: job.id, lead: plan.lead, duration: plan.duration });
        }
      }

      const paidJob = completedJobs[0];
      await tx`insert into invoices (company_id, customer_id, job_id, status, method, subtotal_cents, discount_cents, tip_cents, total_cents, amount_paid_cents, paid_at, payment_note) values (${company.id}, ${hale.id}, ${paidJob.id}, 'paid', 'other', 14500, 0, 1000, 15500, 15500, ${new Date()}, 'Fictional demo payment — no real processor used.')`;
      const [period] = await tx`insert into payroll_periods (company_id, start_date, end_date, status) values (${company.id}, ${isoDate(-14)}, ${isoDate(-1)}, 'open') returning id`;
      await tx`insert into payroll_lines ${tx([
        { payroll_period_id: period.id, user_id: hourly.id, jobs_count: 4, regular_hours: "10.50", commission_cents: 0, office_hours: "10.50", office_pay_cents: 23625, mileage_miles: "18.00", mileage_cents: 630, calculation: JSON.stringify([{ source: "fictional demo time entries" }]), final_cents: 24255 },
        { payroll_period_id: period.id, user_id: commission.id, jobs_count: 6, regular_hours: "15.00", commission_cents: 39000, office_hours: "0", office_pay_cents: 0, mileage_miles: "22.00", mileage_cents: 770, calculation: JSON.stringify([{ source: "fictional demo completed jobs" }]), final_cents: 39770 },
      ])}`;
    });
  } catch (error) {
    await Promise.all(createdAuthIds.map((id) => supabaseAdmin.auth.admin.deleteUser(id).catch(() => undefined)));
    throw error;
  } finally {
    await sql.end();
  }

  console.log("Created isolated demo tenant successfully.");
  console.log("One-time login credentials (distribute securely; each user must change this password):");
  for (const account of credentials) console.log(`- ${account.role}: username=${account.username} password=${account.password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
