import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Invariant 5 ("02 State Model.md" §3): no employee query selects
 * `jobs.price_cents` or `jobs.discount_cents`. This is a static-source guard,
 * not a live response-body assertion — there is no local server/DB in this
 * test run to send a real request against (see TESTING.md). It scans every
 * `db.select({ ... })` object literal in the employee-facing server files for
 * a key matching /price|cents|discount/i, which is exactly what such a leak
 * would look like at the source. A live-response version of this check is
 * one candidate follow-up for `tests/browser/my-day-field.spec.ts` once
 * authenticated credentials exist.
 */

const BANNED_KEY = /\b(price\w*|cents|discount\w*)\b/i;

// Every server module an employee's browser can reach. Deliberately excludes
// admin/office-only surfaces (e.g. src/app/api/employee-browser/**), which
// are allowed to see price data.
const EMPLOYEE_FACING_FILES = [
  "src/app/(app)/my-day/page.tsx",
  "src/app/(app)/my-day/[jobId]/page.tsx",
  "src/app/api/jobs/[jobId]/clock-in/route.ts",
  "src/app/api/jobs/[jobId]/clock-out/route.ts",
  "src/app/api/jobs/[jobId]/transition/route.ts",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function selectBlocks(source: string): string[] {
  const blocks: string[] = [];
  const pattern = /\.select\(\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    // Balance braces from the opening `{` to find the matching close —
    // select objects can nest (e.g. a value that's itself an object).
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    blocks.push(source.slice(start, i - 1));
  }
  return blocks;
}

for (const relativePath of EMPLOYEE_FACING_FILES) {
  test(`I5: ${relativePath} selects no key matching /price|cents|discount/i`, () => {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    const blocks = selectBlocks(source);
    assert.ok(blocks.length > 0, `expected at least one db.select({...}) in ${relativePath} — update this test's parser if the query style changed`);
    for (const block of blocks) {
      // Only the key side of `key: table.column` matters — a column named
      // e.g. `notifyOnDiscountEligibility` on a table this file doesn't
      // touch isn't a leak, but we check the whole selected object literal
      // since that's exactly the shape a real leak would take.
      assert.doesNotMatch(block, BANNED_KEY, `${relativePath} selects a price/cents/discount-shaped key:\n${block.trim()}`);
    }
  });
}

test("I5 sanity: the matcher actually catches a planted leak", () => {
  const planted = "{ id: jobs.id, priceCents: jobs.priceCents }";
  assert.match(planted, BANNED_KEY);
});
