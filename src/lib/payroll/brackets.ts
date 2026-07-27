/** Pay-tier bracket shape and rules, deliberately kept free of any database
 * import so the Settings → Payroll Tiers client component and the
 * `PATCH /api/settings` handler can share one definition of "well formed".
 * The runtime lookup that consumes these lives in `calculate.ts`. */

export type PayTierBracket = { minHours: number; maxHours: number | null; label: string };

/** Default hour brackets — Simply Maid's original 4-bracket structure
 * (confirmed with the user 2026-07-14). Every company gets this as a
 * starting point, but the bracket count and cutoffs are configurable per
 * company via companies.settings.payTierBrackets (Settings → Payroll
 * Tiers) — different businesses use different commission structures, so
 * this must not be hardcoded company-wide. */
export const DEFAULT_PAY_TIER_BRACKETS: PayTierBracket[] = [
  { minHours: 0, maxHours: 25.99, label: "Under 26 hrs" },
  { minHours: 26, maxHours: 29.99, label: "26–29.99 hrs" },
  { minHours: 30, maxHours: 33.99, label: "30–33.99 hrs" },
  { minHours: 34, maxHours: null, label: "34+ hrs" },
];

export type BracketValidation = { errors: string[]; warnings: string[] };

/** The default ladder deliberately cuts over at `.99` (25.99 → 26), leaving a
 * 0.01 hr sliver between brackets. That's the intended convention, not a
 * misconfiguration, so gaps this small are never reported. */
const IGNORABLE_GAP_HOURS = 0.011;

/**
 * Checks a bracket ladder for the mistakes that `resolveTierRateCents` cannot
 * detect at payroll time. That function sorts by `minHours` and returns the
 * first bracket the hours fall into, falling back to the *highest* bracket's
 * rate when nothing matches — so a ladder that overlaps, runs backwards, or
 * leaves a hole doesn't throw, it quietly pays the wrong rate. Everything in
 * `errors` blocks the save; `warnings` are advisory.
 */
export function validatePayTierBrackets(brackets: PayTierBracket[]): BracketValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (brackets.length === 0) return { errors: ["Add at least one bracket."], warnings };

  brackets.forEach((bracket, index) => {
    const position = `Bracket ${index + 1}`;
    if (!bracket.label?.trim()) errors.push(`${position} needs a label.`);
    if (!Number.isFinite(bracket.minHours) || bracket.minHours < 0) {
      errors.push(`${position} needs a min-hours value of 0 or more.`);
    }
    if (bracket.maxHours !== null && !Number.isFinite(bracket.maxHours)) {
      errors.push(`${position} needs a max-hours value, or leave it blank for "no limit".`);
    }
    if (
      bracket.maxHours !== null &&
      Number.isFinite(bracket.maxHours) &&
      Number.isFinite(bracket.minHours) &&
      bracket.maxHours <= bracket.minHours
    ) {
      errors.push(
        `${position} ends at ${bracket.maxHours} hrs, which is not above its ${bracket.minHours} hr start.`
      );
    }
  });

  for (let i = 1; i < brackets.length; i++) {
    const previous = brackets[i - 1];
    const current = brackets[i];
    if (!Number.isFinite(previous.minHours) || !Number.isFinite(current.minHours)) continue;

    if (current.minHours <= previous.minHours) {
      errors.push(
        `Bracket ${i + 1} starts at ${current.minHours} hrs, which is not above bracket ${i}'s ${previous.minHours} hr start. Brackets must run from fewest hours to most.`
      );
      continue;
    }
    // An open-ended bracket in the middle is caught by the check below; skip
    // it here so the same mistake isn't reported twice.
    if (previous.maxHours === null || !Number.isFinite(previous.maxHours)) continue;

    if (current.minHours <= previous.maxHours) {
      errors.push(
        `Brackets ${i} and ${i + 1} overlap — bracket ${i} ends at ${previous.maxHours} hrs but bracket ${i + 1} starts at ${current.minHours} hrs.`
      );
    } else if (current.minHours - previous.maxHours > IGNORABLE_GAP_HOURS) {
      warnings.push(
        `Nothing covers ${previous.maxHours}–${current.minHours} hrs, so anyone landing in that gap is paid the top bracket's rate.`
      );
    }
  }

  // Without an open-ended top bracket, the highest earners match no bracket and
  // fall through to the top rate anyway — with no way to set it deliberately.
  const openEndedCount = brackets.filter((bracket) => bracket.maxHours === null).length;
  const last = brackets[brackets.length - 1];
  if (openEndedCount === 0) {
    errors.push(
      "The last bracket must be open-ended — clear its max hours so it covers everything above its start."
    );
  } else if (openEndedCount > 1 || last.maxHours !== null) {
    errors.push("Only the last bracket can be open-ended. Give every earlier bracket a max-hours value.");
  }

  const first = brackets[0];
  if (Number.isFinite(first.minHours) && first.minHours > 0) {
    errors.push(
      `The first bracket must start at 0 hrs so nobody falls below the ladder (it starts at ${first.minHours} today).`
    );
  }

  return { errors, warnings };
}
