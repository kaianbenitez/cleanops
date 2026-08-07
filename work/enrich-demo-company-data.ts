/**
 * One-time, additive enrichment for the isolated fictional demo tenant.
 *
 * Usage:
 *   npx tsx work/enrich-demo-company-data.ts          (dry run; no writes)
 *   npx tsx work/enrich-demo-company-data.ts --apply  (writes only demo-tenant rows)
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

// Deliberately fictional names and the exact address convention used by seed-demo-company.ts.
const customerSeed = [
  ["Alden", "Demo01", "client"], ["Bailey", "Demo02", "client"], ["Cory", "Demo03", "client"],
  ["Dakota", "Demo04", "client"], ["Elliot", "Demo05", "client"], ["Finley", "Demo06", "client"],
  ["Gray", "Demo07", "client"], ["Harley", "Demo08", "client"], ["Indigo", "Demo09", "client"],
  ["Jules", "Demo10", "client"], ["Keegan", "Demo11", "client"], ["Lake", "Demo12", "client"],
  ["Marley", "Demo13", "client"], ["Nico", "Demo14", "client"], ["Oakley", "Demo15", "client"],
  ["Peyton", "Demo16", "client"], ["Quincy", "Demo17", "client"], ["River", "Demo18", "client"],
  ["Shiloh", "Demo19", "client"], ["Toby", "Demo20", "client"], ["Umber", "Demo21", "client"],
  ["Vale", "Demo22", "client"], ["Winter", "Demo23", "client"], ["Xan", "Demo24", "client"],
  ["Yael", "Demo25", "client"], ["Zuri", "Demo26", "client"], ["Arden", "Demo27", "client"],
  ["Briar", "Demo28", "client"], ["Cedar", "Demo29", "client"], ["Dune", "Demo30", "client"],
  ["Ember", "Demo31", "client"], ["Fable", "Demo32", "client"], ["Gale", "Demo33", "client"],
  ["Haven", "Demo34", "client"], ["Isle", "Demo35", "client"], ["Juniper", "Demo36", "client"],
  ["Kestrel", "Demo37", "lead"], ["Lark", "Demo38", "lead"], ["Meadow", "Demo39", "lead"],
  ["Nova", "Demo40", "lead"], ["Opal", "Demo41", "quoted"], ["Prairie", "Demo42", "quoted"],
  ["Reef", "Demo43", "quoted"], ["Sol", "Demo44", "first_clean_booked"], ["Tundra", "Demo45", "client"],
  ["Vesper", "Demo46", "client"],
] as const;

const employeeSeed = [
  { firstName: "Alex", lastName: "DemoCleaner", title: "Fictional Demo Cleaning Technician", payType: "commission_jth", hourlyRateCents: 2500 },
  { firstName: "Bryn", lastName: "DemoCleaner", title: "Fictional Demo Cleaning Technician", payType: "commission_jth", hourlyRateCents: 2550 },
  { firstName: "Cleo", lastName: "DemoCleaner", title: "Fictional Demo Cleaning Technician", payType: "office_hourly", hourlyRateCents: 2300 },
] as const;

const jobPrices = [14500, 16500, 18500, 21000, 23500, 26000, 28500, 31000, 34500, 38000, 19500, 22500, 27500, 29500, 32500, 36000, 15500, 17500, 20500, 24500, 26500, 30500, 33500, 39500, 21500, 25500, 29000, 32000, 35000, 18000, 24000, 30000] as const;
const quotePlans = [
  { customerIndex: 37, status: "sent", totalCents: 28500 },
  { customerIndex: 38, status: "sent", totalCents: 24500 },
  { customerIndex: 40, status: "viewed", totalCents: 31000 },
  { customerIndex: 41, status: "accepted", totalCents: 26500 },
  { customerIndex: 42, status: "accepted", totalCents: 34000 },
  { customerIndex: 43, status: "accepted", totalCents: 22000 },
  { customerIndex: 44, status: "draft", totalCents: 19500 },
] as const;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured.");
  if (apply && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for --apply.");
  }

  const [company] = await sql`select id from companies where name = ${DEMO_COMPANY_NAME} limit 1`;
  if (!company) throw new Error(`Demo tenant \"${DEMO_COMPANY_NAME}\" was not found. No changes were made.`);
  const [current] = await sql`
    select
      (select count(*)::int from customers where company_id = ${company.id}) as customers,
      (select count(*)::int from invoices where company_id = ${company.id} and status = 'paid') as paid_invoices,
      (select coalesce(sum(amount_paid_cents), 0)::int from invoices where company_id = ${company.id} and status = 'paid') as paid_invoice_cents,
      (select count(*)::int from quotes where company_id = ${company.id}) as quotes,
      (select count(*)::int from users where company_id = ${company.id}) as users,
      (select count(*)::int from users where company_id = ${company.id} and role = 'employee') as employees,
      (select count(*)::int from customers where company_id = ${company.id} and email like '%@fictional-demo.example') as prior_enrichment;
  `;
  if (current.prior_enrichment > 0) throw new Error("Refusing to run: this enrichment appears to have already been applied. No changes were made.");

  const invoiceTotalCents = jobPrices.reduce((sum, price, index) => sum + price + (index % 5 === 0 ? 1000 : 0), 0);
  console.log(`Mode: ${apply ? "APPLY (will write only to the demo tenant)" : "DRY RUN (no writes)"}`);
  console.log(`Demo company id: ${company.id}`);
  console.log(`Current → projected: customers ${current.customers} → ${current.customers + customerSeed.length}; paid invoices ${current.paid_invoices} → ${current.paid_invoices + jobPrices.length}; paid revenue $${(current.paid_invoice_cents / 100).toFixed(2)} → $${((current.paid_invoice_cents + invoiceTotalCents) / 100).toFixed(2)}; quotes ${current.quotes} → ${current.quotes + quotePlans.length}; employees ${current.employees} → ${current.employees + employeeSeed.length}; all team users ${current.users} → ${current.users + employeeSeed.length}.`);
  console.log(`Would add: ${customerSeed.length} fictional customers (38 Active clients, 4 Leads, 3 Quoted, 1 First clean booked); ${jobPrices.length} completed jobs and paid invoices across ${new Set(jobPrices.map((_, index) => isoDate(-20 + Math.floor(index / 2)))).size} dates; ${quotePlans.length} quotes (2 sent, 1 viewed, 3 accepted, 1 draft); ${employeeSeed.length} fictional cleaners.`);
  console.log(`Sample customers: ${customerSeed.slice(0, 3).map(([first, last], index) => `${first} ${last}, ${200 + index} Fictional Demo Lane, Sampleville`).join(" | ")}`);
  console.log(`Sample paid invoices: ${jobPrices.slice(0, 3).map((price, index) => `${isoDate(-20 + Math.floor(index / 2))} $${((price + (index % 5 === 0 ? 1000 : 0)) / 100).toFixed(2)}`).join(" | ")}`);
  if (!apply) {
    await sql.end();
    return;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const credentials = employeeSeed.map((employee) => {
    const username = slugifyUsername(employee.firstName, employee.lastName);
    return { ...employee, username, email: usernameToEmail(username), id: "", password: generateTemporaryPassword() };
  });
  const authIds: string[] = [];
  try {
    for (const account of credentials) {
      const { data, error } = await supabase.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
      if (error || !data.user) throw new Error(`Could not create auth account ${account.email}: ${error?.message ?? "unknown error"}`);
      account.id = data.user.id;
      authIds.push(data.user.id);
    }

    await sql.begin(async (tx) => {
      const [guard] = await tx`select count(*)::int as prior_enrichment from customers where company_id = ${company.id} and email like '%@fictional-demo.example'`;
      if (guard.prior_enrichment > 0) throw new Error("Refusing to apply: this enrichment appears to have already been applied.");
      const employees = await tx`insert into users ${tx(credentials.map((account) => ({
        id: account.id, company_id: company.id, role: "employee", is_field_staff: true, first_name: account.firstName, last_name: account.lastName,
        email: account.email, title: account.title, hired_date: isoDate(-45), pay_type: account.payType, hourly_rate_cents: account.hourlyRateCents,
        is_active: true, must_change_password: true,
      })))} returning id`;
      const customers = await tx`insert into customers ${tx(customerSeed.map(([firstName, lastName, status], index) => ({
        company_id: company.id, first_name: firstName, last_name: lastName, email: `fictional.customer.${String(index + 1).padStart(2, "0")}@fictional-demo.example`, phone: `555-02${String(index + 1).padStart(2, "0")}`,
        address_line1: `${200 + index} Fictional Demo Lane`, city: "Sampleville", state: "IL", zip: `000${String(index + 20).padStart(2, "0")}`, county: "Example County", subdivision: "Training Meadows",
        home_details: JSON.stringify({ bedrooms: 2 + (index % 4), bathrooms: 1 + (index % 3), kitchens: 1, livingRooms: 1, offices: index % 2 }),
        operational_notes: "Fictional training data only — no real home or customer.", general_notes: "Fictional demo record for public marketing screenshots.", tags: JSON.stringify(["demo-data"]),
        text_messaging_allowed: false, status, client_type: "residential", recurrence: status === "client" ? ["weekly", "biweekly", "every4weeks", "monthly"][index % 4] : null, source: "Fictional demo marketing seed",
      })))} returning id, first_name, last_name`;
      const quotes = await tx`insert into quotes ${tx(quotePlans.map((plan, index) => ({
        company_id: company.id, customer_id: customers[plan.customerIndex].id, status: plan.status, public_token: randomUUID(), requested_service_type: "deep_clean", room_counts: JSON.stringify([]), all_tier_pricing: JSON.stringify({}), total_cents: plan.totalCents,
        notes_to_customer: "Fictional demo proposal for marketing screenshots.", valid_until: isoDate(14 + index), sent_at: plan.status === "draft" ? null : new Date(`${isoDate(-10 + index)}T15:00:00.000Z`),
        viewed_at: plan.status === "viewed" || plan.status === "accepted" ? new Date(`${isoDate(-8 + index)}T15:00:00.000Z`) : null,
        accepted_at: plan.status === "accepted" ? new Date(`${isoDate(-6 + index)}T15:00:00.000Z`) : null, accepted_service_type: plan.status === "accepted" ? "deep_clean" : null,
        signature_name: plan.status === "accepted" ? `${customers[plan.customerIndex].first_name} ${customers[plan.customerIndex].last_name} (Fictional Demo)` : null,
        signature_at: plan.status === "accepted" ? new Date(`${isoDate(-6 + index)}T15:00:00.000Z`) : null,
      })))} `;
      for (const [index, price] of jobPrices.entries()) {
        const customer = customers[index];
        const service = index % 4 === 0 ? "deep_clean" : index % 5 === 0 ? "move_out" : index % 3 === 0 ? "first_clean" : "recurring";
        const scheduledDate = isoDate(-20 + Math.floor(index / 2));
        const paidAt = new Date(`${scheduledDate}T${index % 2 ? "19:15:00" : "16:45:00"}.000Z`);
        const [job] = await tx`insert into jobs (company_id, customer_id, type, status, scheduled_date, scheduled_start_time, estimated_duration_minutes, price_cents, add_on_ids, completion_notes, cleaner_notes, completed_at, payment_method_collected)
          values (${company.id}, ${customer.id}, ${service}, 'completed', ${scheduledDate}, ${index % 2 ? "10:00:00" : "08:30:00"}, ${150 + (index % 4) * 30}, ${price}, '[]'::jsonb, 'Fictional demo clean completed successfully.', 'Fictional field note for marketing data.', ${paidAt}, 'not_collected') returning id`;
        const lead = employees[index % employees.length];
        await tx`insert into job_assignments (job_id, user_id, role) values (${job.id}, ${lead.id}, 'lead')`;
        await tx`insert into invoices (company_id, customer_id, job_id, status, method, subtotal_cents, discount_cents, tip_cents, total_cents, amount_paid_cents, paid_at, payment_note)
          values (${company.id}, ${customer.id}, ${job.id}, 'paid', 'other', ${price}, 0, ${index % 5 === 0 ? 1000 : 0}, ${price + (index % 5 === 0 ? 1000 : 0)}, ${price + (index % 5 === 0 ? 1000 : 0)}, ${paidAt}, 'Fictional demo payment — no real processor used.')`;
      }
      void quotes;
    });
  } catch (error) {
    await Promise.all(authIds.map((id) => supabase.auth.admin.deleteUser(id).catch(() => undefined)));
    throw error;
  } finally {
    await sql.end();
  }
  console.log("Applied enrichment to the isolated fictional demo tenant. Temporary passwords were generated but intentionally not printed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
