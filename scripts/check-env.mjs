import fs from "node:fs";
import process from "node:process";

const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const optionalForIntegrations = [
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "GHL_WEBHOOK_SECRET",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_ENVIRONMENT",
  "SQUARE_WEBHOOK_SIGNATURE_KEY",
  "CRON_SECRET",
];

const source = fs.existsSync(".env.local") ? ".env.local" : ".env.local.example";
const fileValues = new Map();
for (const line of fs.readFileSync(source, "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) fileValues.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
}

function value(name) {
  return process.env[name] ?? fileValues.get(name) ?? "";
}

const missing = required.filter((name) => !value(name).trim());
const configured = [...required, ...optionalForIntegrations].filter((name) => Boolean(value(name).trim()));
const unsafe = ["DATABASE_URL", ...optionalForIntegrations].filter((name) => /[\r\n]/.test(value(name)));

console.log(`Environment source: ${source}`);
console.log(`Configured: ${configured.length}/${required.length + optionalForIntegrations.length}`);
if (missing.length) {
  console.error(`Missing required variables: ${missing.join(", ")}`);
  process.exitCode = 1;
}
if (unsafe.length) {
  console.error(`Variables contain a newline; re-save them as one line: ${unsafe.join(", ")}`);
  process.exitCode = 1;
}
if (!missing.length && !unsafe.length) console.log("Environment check passed. Secret values were not printed.");
