import process from "node:process";

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const checks = [
  ["/", 200],
  ["/login", 200],
  ["/quote/not-a-real-token", 200],
  ["/dashboard", 307],
  ["/my-day", 307],
  ["/settings/ghl", 307],
];

let failed = false;
for (const [path, expected] of checks) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    const actual = response.status;
    const ok = actual === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${path} expected ${expected}, got ${actual}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.log(`FAIL ${path} ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exitCode = 1;
