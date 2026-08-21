---
target: My Day employee portal UI/UX
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T08-10-07Z
slug: src-app-app-my-day-my-day-client-tsx
---
# My Day employee portal critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Strong Now region and receipts; stacked notices can push the action away. |
| 2 | Match System / Real World | 4/4 | Traveling, arrived, cleaning, wrap-up, waiting on crew match field language. |
| 3 | User Control and Freedom | 3/4 | Travel has Undo/discard; later transitions have less reversal control. |
| 4 | Consistency and Standards | 3/4 | Strong field patterns, with several secondary link/button treatments competing. |
| 5 | Error Prevention | 4/4 | Busy guard, idempotency, uncertain-save handling, and explicit consequences are excellent. |
| 6 | Recognition Rather Than Recall | 3/4 | Current stop is recognizable; the lower ledger still asks for more reading. |
| 7 | Flexibility and Efficiency | 3/4 | One primary action is efficient; details and mileage add secondary taps. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Calm and product-specific, but active-stop support content can become dense. |
| 9 | Error Recovery | 4/4 | Check status, office call, Undo, and named failure states are unusually strong. |
| 10 | Help and Documentation | 2/4 | Help exists, but it is low in the page and not contextual to the active task. |
| **Total** |  | **32/40** | Strong operational foundation; protect the primary action more aggressively. |

## Design Specificity Verdict

This feels authored for Shimmer and cleaning technicians. The Workday Ledger, independent time/work-state language, crew-waiting state, access instructions, mileage, and route rail give it a real operational point of view. It is not a generic task dashboard.

The deterministic detector returned zero findings across `my-day-client.tsx`, `now-region.tsx`, `ledger.tsx`, and `app-nav.tsx`. No false positives or implementation-integrity concerns were found by the scan.

## Overall Impression

The product has moved from “job card with a timer” to a trustworthy workday companion. The strongest work is the state model and the honest handling of uncertain network results. The biggest opportunity is compression: preserve the confidence-building detail, but make the next action visually immovable when the screen is busy.

## What's Working

- The Now region separates recorded time from work state, eliminating the most dangerous ambiguity in the old experience.
- The primary action changes with the real state and uses plain language: travel, arrive, start cleaning, wrap up.
- Receipts, idempotency, Undo, and uncertain-save recovery make high-stakes taps feel safe.

## Priority Issues

### [P1] The primary action can be displaced by stacked feedback

Receipt, uncertain-save, error, stale-entry, loadout, and access content all appear above or around the active stop. In a real field moment, the employee may have to scroll to find what to do next, especially after an error or a long instruction block.

Fix: reserve a persistent action zone directly beneath the Now region, or make the active action sticky within the phone viewport. Keep receipts compact and let secondary notices collapse after acknowledgement. Suggested command: `$impeccable layout`.

### [P1] The active stop still carries too many competing secondary decisions

Job details, mileage, discard start, entry instructions, rotational tasks, pet notes, and do-not-clean notes all live in the same active region. Each is valid, but together they dilute the single-task flow.

Fix: establish a strict order: safety/access first, primary state action second, job details/mileage third. Hide low-frequency content behind named disclosure rows and keep warnings expanded only when they change what the cleaner must do. Suggested command: `$impeccable distill`.

### [P2] The ledger is useful but visually interrupts route scanning

Today’s upcoming stops, ledger history, and rest-of-week stops are separate concepts, yet the screen presents them in one continuous scroll. The employee can mistake history for upcoming work when moving quickly.

Fix: label the ledger as “What you’ve recorded” and give it a quieter, compressed treatment; keep “Rest of today” and “Rest of the week” as the dominant route landmarks. Suggested command: `$impeccable clarify`.

### [P2] Help is discoverable only after the work surface is exhausted

The footer Help Center is appropriate for a calm admin surface, but field staff may need support during an access or transition problem. The current office-call path is stronger than the Help Center path.

Fix: keep Help out of the primary flow, but add a compact “Need help?” path inside stale, uncertain, and missing-address states. Suggested command: `$impeccable harden`.

### [P3] The interface is visually calm but could signal urgency more deliberately

The restrained cobalt system is right for field work. Still, missing-address and do-not-clean conditions rely on small supporting treatments. They should remain rare, but when present they deserve a clearer “pay attention before entering” hierarchy. Suggested command: `$impeccable colorize`.

## Persona Red Flags

**Jaelie, interrupted cleaner:** After a failed or uncertain tap, the confirmation and recovery UI can push the next action below the fold. She may read the screen as “nothing happened” even though the system is protecting her from a duplicate action.

**First-time cleaner:** “Recorded work time” and “work state” are accurate but still require learning. The first visit should explain, in one short sentence, that the timer records this work period and the larger action controls the next job step.

**Helper on a crew job:** The waiting-on-crew state is well handled, but the distinction between “my work is saved” and “the house is finished” must stay visually prominent. Never let a completed-looking row imply the whole job is done.

## Minor Observations

- The profile photo in Me improves trust and ownership; keep the initials fallback for privacy and incomplete profiles.
- The 44px/56px touch-target discipline is strong and should remain non-negotiable.
- Map links, mileage, and job details are correctly treated as secondary actions rather than competing with the main state transition.
- No browser screenshot was available in this session, so spacing, fold position, and contrast were reviewed from source and existing design tokens rather than live-rendered evidence.

## Questions to Consider

- Can the employee answer “what do I do next?” without reading below the active stop?
- What should remain visible if the receipt, error, and access instructions all appear at once?
- Is “Job details” the right label, or would “More about this stop” better match a cleaner’s mental model?
- Should the primary action stay pinned while the employee scrolls through entry instructions?
