import { config } from "dotenv";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

// Accept the base URL as an argument like scripts/smoke-routes.mjs, so both smoke
// scripts take the same `npm run smoke:auth -- http://localhost:3100` invocation.
const baseUrl = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
// Login is username-based (see src/lib/auth/username.ts). Supabase Auth still needs
// an email-shaped identifier, so map <username>@cleanops.local here. The previous
// default, admin@example.com, was deleted in the username-auth migration.
const username = process.env.SMOKE_USERNAME ?? "kaianbenitez";
const email = process.env.SMOKE_EMAIL ?? `${username}@cleanops.local`;
const cookies = new Map();

const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...cookies.entries()].map(([name, value]) => ({ name, value })),
    setAll: (items) => items.forEach(({ name, value }) => cookies.set(name, value)),
  },
});

// Password sign-in now requires a solved Turnstile challenge (CAPTCHA protection
// enabled 2026-07-28), which this script — deliberately, like a bot — cannot
// solve. Establish the session the same way a trusted server-side script should:
// service-role admin.generateLink() mints a one-time magic-link token, then a
// normal (anon-key) verifyOtp() redeems it. Neither endpoint is CAPTCHA-gated
// (only sign-in/sign-up/password-reset are), so this bypasses the bot check
// without weakening it — it still requires the service role key to run.
const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
if (linkError) throw new Error(`Could not generate a login link: ${linkError.message}`);

const login = await supabase.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: "magiclink",
});
if (login.error) throw new Error(`Authentication failed: ${login.error.message}`);

const cookieHeader = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
const checks = [];

async function check(path, expectedKey, expectedMarker) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: cookieHeader } });
  const body = await response.text();
  let data = null;
  try { data = JSON.parse(body); } catch { /* HTML route */ }
  const valid = response.ok && (expectedKey ? Array.isArray(data?.[expectedKey]) ? data[expectedKey].length >= 0 : Boolean(data?.[expectedKey]) : expectedMarker ? body.includes(expectedMarker) : true);
  checks.push({ path, valid, detail: response.status });
  return data;
}

for (const [path, marker] of [["/dashboard", "Dashboard"], ["/customers", "Customers"], ["/jobs", "Jobs"], ["/payroll", "Payroll"], ["/invoices", "Invoices"], ["/settings", "Settings"], ["/supplies", "Supplies"]]) await check(path, null, marker);
const customers = await check("/api/customers", "customers");
await check("/api/employees", "employees");
const invoices = await check("/api/invoices", "invoices");
const quotes = await check("/api/quotes", "quotes");
await check("/api/payroll-periods", "periods");
await check("/api/settings", "company");
await check("/api/room-types", "roomTypes");
await check("/api/services", "services");
await check("/api/service-locations?all=1", "locations");

const today = new Date().toISOString().slice(0, 10);
const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const jobs = await check(`/api/jobs?start=${today}&end=${end}`, "jobs");
if (customers?.customers?.[0]) await check(`/api/customers/${customers.customers[0].id}`, "customer");
if (jobs?.jobs?.[0]) await check(`/api/jobs/${jobs.jobs[0].id}`, "job");
if (customers?.customers?.[0]) await check(`/customers/${customers.customers[0].id}`, null, null);
if (jobs?.jobs?.[0]) await check(`/jobs/${jobs.jobs[0].id}`, null, null);
if (invoices?.invoices?.[0]) await check(`/invoices/${invoices.invoices[0].id}`, null, null);
if (quotes?.quotes?.[0]) await check(`/quotes/${quotes.quotes[0].id}`, null, null);

const failed = checks.filter((checkResult) => !checkResult.valid);
for (const checkResult of checks) console.log(`${checkResult.valid ? "PASS" : "FAIL"} ${checkResult.path} (${checkResult.detail})`);
if (failed.length) process.exit(1);
console.log(`Smoke test passed: ${checks.length} checks.`);
