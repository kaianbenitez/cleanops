---
target: Customer proposal page
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-21T08-12-03Z
slug: src-app-quote-token-page-tsx
---
# Customer proposal critique

## Heuristic scores

| Heuristic | Score | Key issue |
|---|---:|---|
| Visibility of system status | 3/4 | Selection and total update clearly; loading and acceptance feedback are basic. |
| Match system / real world | 3/4 | Friendly proposal language, but “travel zone” and estimate disclaimers feel internal. |
| User control and freedom | 2/4 | Choices can be toggled, but the long flow has no persistent summary or mobile CTA. |
| Consistency and standards | 3/4 | Strong repeated component language, though oversized card/radius treatment dominates. |
| Error prevention | 2/4 | Acceptance can read as reservation while no date/time is chosen; add-on pricing can remain unresolved. |
| Recognition rather than recall | 3/4 | Cards and totals are understandable, but the total lacks a visible line-item explanation. |
| Flexibility and efficiency | 2/4 | The customer must scroll through a long page to compare, customize, and accept. |
| Aesthetic and minimalist design | 2/4 | Many large rounded sections create a long, repetitive “card stack” and dilute the decision moment. |
| Error recovery | 2/4 | Inline errors exist, but the acceptance failure path does not preserve a strong recovery explanation. |
| Help and documentation | 3/4 | FAQ and terms are present, but key reassurance appears late in the journey. |

Total: 25/40.

## Design specificity verdict

The proposal has a credible Shimmer identity—cobalt action color, customer-specific address, service choices, and operational trust content—but the composition is still category-interchangeable: a long SaaS pricing page made from repeated rounded cards. The best opportunity is to make the decision itself feel more bespoke and calm: one clear recommendation, transparent price composition, and a persistent accept path.

## Priority issues

1. **[P0] The acceptance promise is ambiguous.** The CTA says “Accept and reserve,” while the page says the team will confirm scheduling and no date/time is selected. Customers may believe a cleaning is booked when it is only accepted. Change the CTA and confirmation copy to one precise promise, or add the scheduling step before acceptance.
2. **[P1] The total is not transparently composed.** The sticky “Your total” shows one number, while extras are selected far away and no base/add-on/discount breakdown is visible beside the CTA. Add a live line-item summary directly above the signature and acceptance button.
3. **[P1] Mobile conversion has no persistent action.** The desktop sidebar is sticky, but on mobile it moves below a very long sequence of services, terms, extras, photos, documents, FAQs, and service terms. Add a compact sticky bottom bar with total and “Accept proposal,” respecting safe-area padding.
4. **[P1] The page asks for too many decisions before commitment.** Main service selection, optional recurring enrollment, recurring frequency, extras, FAQs, and terms all compete in one scroll. Keep the primary recommendation and recurring choice near the top; move proof/FAQ/documentation into collapsible or secondary sections.
5. **[P2] Trust content arrives too late and lacks hierarchy.** Insurance/W-9, before/after, and the reassurance panel are useful, but they are buried after the pricing decision. Surface a compact trust strip near the header and keep detailed proof lower on the page.

## Personas

- **Jordan, first-timer:** “Choose a service,” recurring upsell, extras, terms, and a large disclaimer create uncertainty about what to select first; the next step is not obvious until the sidebar is found.
- **Casey, distracted mobile user:** the signature and acceptance action are far below the fold; leaving the tab loses the mental context of the chosen options because there is no persistent summary.
- **Riley, stress tester:** custom-priced extras can produce a total that does not fully explain what remains to be priced; expired/accepted states are clear but do not offer a contact or next-step recovery path.

## Minor observations

- “Cancelation” is misspelled in the FAQ; use “cancellation.”
- “Most popular” is hard-coded to the second main tier rather than tied to a configured recommendation.
- “CO” is a weak no-logo fallback; use the company name initial or a neutral wordmark treatment.
- The proposal ID is useful for support but visually competes with the customer-facing location metadata.

## Questions

- Is acceptance intended to be a legal/financial commitment, or simply an approval to begin scheduling?
- Which service should Shimmer recommend when the customer opens the proposal?
- What is the single reassurance that would make a customer comfortable signing today?
