# Handoff: Shimmer design refinement

Author: Claude Opus 5. Date: 2026-08-15. Implementer: Claude Sonnet 5.
Read `AGENTS.md` and `HANDOFF.md` first. This document does not supersede them.

Scope was set by the owner: **brand colors are locked, everything else is open**
(layout, alignment, typography, iconography, the logo mark, component structure).
Priority order: **1) my-day / employee, 2) admin view, 3) landing page.**

This is a design contract, not a rewrite mandate. Where a surface already works,
it is left alone and said so.

---

## 0. Design read

> Reading this as: **a two-audience product**. `/my-day` is a phone-first field
> tool used one-handed, outdoors, mid-shift. The admin side is a desktop
> operations console read at 6:45am. The landing page is B2B SaaS for
> owner-operators of cleaning businesses. These want three different densities
> and one shared identity, and today they have the reverse: one shared density
> and three drifting identities.

Dials, per surface:

| Surface | Variance | Motion | Density | Why |
|---|---|---|---|---|
| `/my-day` (field) | 3 | 2 | 3 | Glanceable, gloves, sunlight. Boring is correct. |
| Admin console | 4 | 3 | 7 | Dense, scannable, no decoration. |
| Landing page | 7 | 5 | 4 | Needs to sell. Currently the most templated of the three. |

The app is **not** in this skill's usual territory (it is product UI, not a
landing page), so marketing-page rules are applied only to §6. For the app
surfaces the governing standard is information design: summary before detail,
state encoded in form as well as color, and type sized for the actual viewing
distance.

---

## 1. The diagnosis in one paragraph

Shimmer does not read as "AI slop" because of any single ugly screen. It
reads that way because **three design systems are running at once and none of
them is winning**: the `--co-*` custom properties (the real one), the shadcn
`--background/--primary/...` set (vestigial, still green), and 542 raw Tailwind
palette utilities that bypass both. `DESIGN.md` describes a fourth system that
does not exist in the code. The result is a UI where nothing is individually
broken enough to point at, but every surface is slightly out of tune with every
other one. That is the exact texture of generated work, and it is fixable
mechanically, which is the good news.

---

## 2. Evidence

Every claim below is verifiable from the code at the cited location.

### 2.1 Dark mode is broken across most of the app  (highest severity)

The app implements dark mode by swapping `--co-*` variable values under a
`.dark` class (`globals.css:365-436`). It does **not** use Tailwind `dark:`
variants as its strategy. But:

- **542** raw Tailwind palette utilities are in use (`bg-rose-50`,
  `text-emerald-700`, `border-violet-200`, ...).
- Only **12 of 159** `.tsx` files contain any `dark:` variant at all.
- **244** lines use a raw palette color with no `dark:` anywhere on the line.

A `bg-rose-50` is `#fff1f2` in both themes. So in dark mode these render as
**bright light-mode islands inside a dark shell**. This is the single largest
contributor to the app feeling unfinished.

Hue census of the 542:

| Hue | Count | Status |
|---|---|---|
| rose | 213 | not a brand color |
| amber | 149 | near-duplicate of `--co-spark-accent`, not the same value |
| emerald | 83 | leftover from the pre-cobalt era |
| slate | 58 | duplicates the neutral ramp at a different temperature |
| violet | 28 | **not in the palette at any level** |
| blue / sky | 11 | near-duplicate of `--co-accent`, not the same value |

Seven accent families in a two-color brand. The violet block
(`my-day-client.tsx:52, 57, 381, 382`) is literally the AI-purple tell, shipping
on the highest-priority surface.

### 2.2 Field staff get dark mode with no way to turn it off

`theme-provider.tsx:27-33` applies `.dark` from `prefers-color-scheme` for
**every** authenticated user. But every theme control is admin-gated:
`app-nav.tsx:193, 306, 440` and `(app)/layout.tsx:49` are all
`{isAdmin ? <ThemeToggle /> : null}`.

A cleaner whose phone is in dark mode gets the dark shell, plus 27 raw
light-palette blocks in `my-day-client.tsx`, and no toggle. This is priority
surface #1 and it is the worst case of §2.1.

Related: `theme-provider.tsx` sets the theme in `useEffect` after mount, so
dark-mode users get a **white flash on every page load**. Fix is a blocking
inline script in `<head>`, not a client effect.

### 2.3 The green-to-cobalt migration was never finished

`--co-evergreen` holds `#2457ff`, which is cobalt. The name is a lie, and the
old green is still physically present:

| Location | Leftover | Visible effect |
|---|---|---|
| `globals.css:191` | `box-shadow: 0 8px 18px rgba(0,108,73,0.2)` | **green glow under every cobalt primary button** |
| `(app)/layout.tsx:33` | two `rgba(0,108,73,...)` radial gradients | **green ambient blobs behind the whole app** |
| `globals.css:135` | `::selection` green on cobalt text | green highlight, cobalt text |
| `globals.css:63,64,68,75,80` | `--ring`, `--chart-1`, `--chart-5`, `--sidebar-primary`, `--sidebar-ring` | green focus rings and chart series |
| `globals.css:38,39,61,62,79` | `#6c7a71`, `#bbcabf` | **green-gray borders and placeholders** app-wide |
| `globals.css:73` | `--sidebar: #eef6ee` | green-tinted sidebar |
| `globals.css:411,417,430` | `oklch(...151.328)`, `oklch(...149.579)` | dark-mode shadcn tokens still fully green |

Plus green-gray hex literals in components: `#cad6ca` (x9), `#d5ded5` (x7),
`#d3e0d2` (x6), `#f7fbf5`, `#edf3e9`, `#e4eee2`, `#5c7436` (olive).

**This is why the app "feels off" in a way that is hard to name.** Green-gray
borders against a blue-gray surface read as dirty, not as a second color.

### 2.4 The dark-mode cobalt hack is a symptom worth curing

`globals.css:473` ships an unlayered attribute selector:

```css
.dark [class~="bg-[var(--co-evergreen)]"][class~="text-white"] { ... }
```

The 35-line comment above it is honest and correct about why it exists, and
correctly warns that it silently kills `hover:` variants. But the root cause is
that `--co-evergreen` is used as **both** "accent text on a light ground" and
"solid fill under white text", which no single value can satisfy in dark mode.

Splitting it into `--co-accent-text` and `--co-accent-fill` removes the hack
entirely. See §3.

### 2.5 Type is sized for a dashboard and used on a phone

`my-day-client.tsx` type census: `text-xs` x24, `text-[10px]` x6, `text-sm` x8,
`text-lg` x5, `text-base` x1. **30 of 44 type instances are 12px or smaller**,
on the surface a cleaner reads at arm's length in daylight.

The job-card status banner (`my-day-client.tsx:429-431`) is
`font-mono text-[10px] uppercase tracking-[0.16em]` — 10px letterspaced mono
for the single most important state on the screen.

The font itself is **Inter**, loaded into variables named `--font-geist-sans`
and `--font-geist-mono` (`layout.tsx:2-13`). Second naming lie after
`--co-evergreen`.

### 2.6 Shape and stroke have no scale

- Off-scale radii still in the tree: `rounded-[14px]` x14, `rounded-[28px]` x9,
  `rounded-[18px]` x3, `rounded-[32px]` x2. `HANDOFF.ui-audit-followup.md` §7
  (WP-E) planned this cleanup; it never ran, the gate is now clear.
- Icon stroke widths in use: `1.75` (x10), `2` (x7), `2.2` (x2), `1.8` (x1).
  `DESIGN.md` specifies 2px. Nothing enforces it.

### 2.7 `DESIGN.md` is stale and actively misleading

It documents a Material-style token set (`surface-container-*`, `on-surface`,
`primary-fixed`, ...) that appears **nowhere** in the codebase, a surface color
of `#f4fbf4` (green) when the app uses `#f6f8ff` (blue), and a radius scale
(`lg: 1rem`, `xl: 1.5rem`) that contradicts `globals.css:71-72`. Any agent
handed `DESIGN.md` as ground truth will produce drift. It caused some of the
drift already present.

### 2.8 Per-surface findings

**`/my-day`** — `my-day-client.tsx`
- L404: renders a **raw ISO date** to a field user: `"2026-08-15 service order"`.
  Copy is also meaningless.
- L317: `{dayLabel} · {n} stops · {weeklyHours.toFixed(2)}h this week` — three
  middle-dot separated facts, and `12.75h` is payroll precision in a glance strip.
- L397: eyebrow reads "Route preview" above a heading that reads "Today's jobs".
  It is not a route preview, and the eyebrow adds nothing.
- L52/381: the violet rotational-task block, discussed above.

**Admin dashboard** — `dashboard/page.tsx`, `operations-overview.tsx`
- `page.tsx:98`: `<div className="grid gap-5 xl:grid-cols-2">` contains **one**
  child (`CashToCollect`). It renders at half width with dead space beside it.
- `operations-overview.tsx:105`: 5 KPI cards in `sm:grid-cols-2 xl:grid-cols-5`.
  At `sm` the fifth card orphans on its own row.
- `operations-overview.tsx:216-233`: "System insights" is three generated
  sentences restating numbers already displayed above them ("Quote conversion is
  34% for this period..." when a "Conversion rate" KPI card is on the same
  screen). `UI-AUDIT.md`'s own Stitch filter says to reject exactly this.
- `page.tsx:52` titles the page "Performance overview" while the nav item says
  "Dashboard".
- Genuinely good and to be preserved: the `Suspense` boundaries with matched
  skeletons, the range controls, `TodaysRun`/`TechnicianRoutes` structure. The
  dashboard rebuild since `UI-AUDIT.md` clearly landed; that audit's score of 4
  is out of date.

**Landing page** — `marketing-page.tsx`
- **15 em-dashes** across the landing components and metadata
  (`marketing-page.tsx` x3, `page.tsx` x4, `marketing-faq.tsx` x5,
  `feature-bento.tsx` x3).
- Hero carries **5 text elements**: eyebrow, h1, 30-word subtext, three CTAs,
  plus a tagline under the CTAs (L34). Three CTAs of two different intents
  ("Join the beta", "See how it works", "Log in") in one row.
- **4 eyebrows** across ~7 sections (L34, L38, L44, L48).
- L48: `0{index + 1}` renders `01 / 02 / 03 / 04` step numbering. The steps are
  a real sequence, so numbering is defensible; the mono-caps treatment is not.
- Off-token hex literals: `bg-[#f1f5ff]` (L38) and
  `linear-gradient(135deg,#edf3ff,#f7f9ff,...)` (L33) — the same fingerprint
  `UI-AUDIT.md` flagged in the app.
- Two decorative gradient hairlines (L40, L46) that organize no content.
- Three consecutive asymmetric text/visual splits (`0.9fr_1.1fr`,
  `0.75fr_1.25fr`, `0.7fr_1.3fr`). Same layout family three times.
- `SparkMark` (L22) is a hand-rolled 8-point star in `#707C8D` **grey**. The
  logo does not use either brand color.
- Genuinely good and to be preserved: real product screenshots (not fake div
  UI), honest beta copy, no fabricated testimonials or logo wall, correct
  `next/font`, working reduced-motion handling.

---

## 3. Foundation: the token layer

**This is WP-1 and everything else depends on it. Do it first, in one commit,
and change no component markup while doing it.**

Brand colors are locked. `#2457ff` cobalt and `#e4942b` spark orange keep their
values. Two additions are *derivations* for accessibility, not brand changes:
`#e4942b` fails WCAG AA as text (2.45:1 on white, 2.25:1 on its own tint), so it
stays a **fill/graphic** color and gains a text-safe sibling.

All values below were verified against WCAG AA (4.5:1) in both themes. Ratios in
comments are measured, not estimated.

### 3.1 Light

```css
:root {
  /* Brand: locked, do not retune */
  --co-brand-cobalt:      #2457ff;
  --co-brand-spark:       #e4942b;   /* fill and graphics ONLY, never text */

  /* Accent, split by role (this split retires the globals.css:473 hack) */
  --co-accent-fill:       #2457ff;   /* white on it: 5.41 */
  --co-accent-fill-hover: #1737a8;
  --co-accent-text:       #2457ff;   /* on surface: 5.41, on tint: 4.80 */
  --co-accent-tint:       #edf1ff;
  --co-spark-fill:        #e4942b;   /* near-black on it: 7.82 */
  --co-spark-text:        #96590a;   /* on surface: 5.63, on tint: 5.13 */
  --co-spark-tint:        #fdf3e4;

  /* Neutrals: one temperature, cobalt-biased, zero green */
  --co-bg:                #f4f6fb;
  --co-surface:           #ffffff;
  --co-surface-muted:     #edf0f8;
  --co-surface-muted-2:   #e0e5f2;
  --co-ink:               #141a2e;   /* on surface 17.26, on bg 15.96 */
  --co-body:              #414a63;   /* on surface  8.81, on muted 7.73 */
  --co-faint:             #5c6580;   /* on surface  5.79, on muted 5.08 */
  --co-line:              #c9d0e2;
  --co-line-soft:         #e4e8f2;

  /* Semantic: independent of accent, never doubles as brand */
  --co-success:           #1f7a3a;   /* 5.38 */
  --co-warning:           #8a5a00;   /* 5.93 */
  --co-danger:            #b03024;   /* 6.37, white on it 6.37 */
}
```

### 3.2 Dark

```css
.dark {
  --co-accent-fill:       #1e47cc;   /* white on it: 7.42 */
  --co-accent-fill-hover: #1737a8;
  --co-accent-text:       #8fb0ff;   /* on surface 8.09, on tint 7.42 */
  --co-accent-tint:       #18213d;
  --co-spark-fill:        #e4942b;
  --co-spark-text:        #e9a94f;   /* on surface 8.45 */
  --co-spark-tint:        #33240f;

  --co-bg:                #0b1020;
  --co-surface:           #141a2c;
  --co-surface-muted:     #1c2338;
  --co-surface-muted-2:   #262f47;
  --co-ink:               #e9edf7;   /* 14.76 */
  --co-body:              #a7b1c9;   /* on surface 8.05, on muted 7.26 */
  --co-faint:             #8f99b4;   /* on surface 6.08, on muted 5.48 */
  --co-line:              #2f3743;
  --co-line-soft:         #242b35;

  --co-success:           #4fbf6d;   /* 7.42 */
  --co-warning:           #dda13c;   /* 7.61 */
  --co-danger:            #e8756a;   /* 5.92 */
}
```

### 3.3 Rules that come with the tokens

1. **Delete** the `.dark [class~="bg-[var(--co-evergreen)]"]` block
   (`globals.css:473-491`) and its `:hover` sibling. The fill/text split makes
   them unnecessary. Verify no primary button, chip, or table header regresses
   in dark mode after removal.
2. **Delete** the green shadow on `.co-button-primary` (`globals.css:191`).
   Replace with a neutral tinted shadow or none.
3. **Delete** the two green radial gradients in `(app)/layout.tsx:33`. Do not
   replace them with cobalt ones. An ambient blob behind an operations console
   is decoration; the flat `--co-bg` is correct.
4. **Fix** `::selection` (`globals.css:135`) to a cobalt tint.
5. **Retire** `--co-evergreen` / `--co-evergreen-soft` / `--co-accent-soft`
   entirely. Rename at every call site rather than aliasing, so the name stops
   lying. This is a large mechanical diff and should be its own commit.
6. **Reconcile** the vestigial shadcn tokens (`--primary`, `--accent`, `--ring`,
   `--chart-*`, `--sidebar-*`). Either point them at the `--co-*` values or
   delete the ones nothing consumes. Do not leave green `oklch()` values behind.
7. **One radius scale.** `--co-radius-control: 8px`, `--co-radius-card: 12px`,
   pill for status only. Collapse the 28 off-scale `rounded-[Npx]` instances
   onto it. This completes WP-E from `HANDOFF.ui-audit-followup.md`; its gate is
   now clear.
8. **One icon stroke.** Standardize on `1.75` (the current plurality) via a
   wrapper or a lint rule, and two sizes only: 16px inline, 20px standalone.

### 3.4 The 542 raw palette utilities

Do **not** hand-edit 542 call sites. Build the semantic layer first, then
convert by meaning:

| Raw pattern | Becomes |
|---|---|
| `rose-*` (errors, destructive) | `--co-danger` + its tint |
| `amber-*` (attention, warnings) | `--co-warning` + its tint |
| `emerald-*` (success, completed) | `--co-success` + its tint |
| `slate-*` (neutral chrome) | the neutral ramp |
| `violet-*` (rotational tasks) | `--co-spark-*`; it is an attention state, not a seventh hue |
| `blue-*` / `sky-*` (accent-ish) | `--co-accent-*` |

Convert per file, verifying each in **both** themes before moving on. Files are
ranked by count in §7 so the highest-value ones go first.

---

## 4. Foundation: typography (WP-2)

Owner decision: **new display face, Inter retained for body.**

```
Display  (h1, h2, page titles, KPI values)  ->  Archivo   (variable, OSS, next/font/google)
Body     (paragraphs, tables, forms, UI)    ->  Inter     (unchanged)
Data     (timestamps, IDs, codes)           ->  JetBrains Mono (unchanged, but used far less)
```

**Why Archivo:** it is a grotesque with tighter apertures and slightly narrower
default width than Inter, which gives KPI numerals real presence at the same
point size without shouting. It is industrial rather than friendly, which suits
an operations product, and it is unmistakably not Inter, which is the point. It
ships tabular figures and is a variable font, so weight is free.

Safer alternative if Archivo reads too condensed at display sizes:
**Instrument Sans**. Do not substitute Geist — it is becoming the successor
default to Inter and would reintroduce the problem.

Required with it:

1. **Rename the font variables.** `--font-geist-sans` currently holds Inter.
   Rename to `--font-sans` / `--font-mono` / `--font-display`.
2. **`font-variant-numeric: tabular-nums`** on every table cell, KPI value,
   money value, and duration. Digits currently jitter between rows.
3. **Cut mono usage.** `.eyebrow` (`globals.css:147`) is mono-uppercase-tracked
   and applied liberally. Reserve mono for genuine machine data (IDs, codes,
   timestamps). Most eyebrows should simply be deleted, not restyled.
4. **A real type scale**, and nothing off it. Two scales, since the surfaces
   differ:

```
Admin console (dense, desktop)      Field / my-day (phone, arm's length)
  display   30 / 36                   display   24 / 30
  title     20 / 28                   title     19 / 26
  body      14 / 20                   body      16 / 24   <- baseline, not 12
  meta      13 / 18                   meta      14 / 20
  micro     12 / 16  (rare)           micro     13 / 18   (rare)
```

The field minimum is **13px**, and body is **16px**. Nothing on `/my-day` may be
smaller than 13px. That alone resolves most of §2.5.

---

## 5. Priority surfaces

### 5.1 `/my-day` — recompose (WP-3, highest priority)

The information architecture is sound. The problem is that a field tool is
wearing dashboard clothes. Changes, in order of impact:

1. **Retype to the field scale** (§4). Body 16px, nothing under 13px. The status
   banner at `my-day-client.tsx:429` becomes 13px, sentence case, not 10px
   letterspaced mono.
2. **Give field staff a theme toggle**, or force `/my-day` to light-only. Either
   is acceptable; silently applying dark with no control is not. Recommend the
   toggle, in the field nav, since cleaners work in varied light.
3. **Purge the violet block** (L52, L381). Rotational tasks are an *attention*
   state: use `--co-spark-*`. This also fixes it in dark mode.
4. **Fix L404**: `formatDisplayDate`, and rewrite the copy. `"2026-08-15 service
   order"` should read like `"4 stops, first at 8:30am"` or be deleted.
5. **Fix L317**: drop to two facts, one separator. `weeklyHours.toFixed(2)`
   becomes `.toFixed(1)` or a rounded hour count.
6. **Delete the "Route preview" eyebrow** (L397). The heading is enough.
7. **Touch targets**: every interactive element on this surface gets a minimum
   44x44px hit area. Audit the inline text links (L349, L354, L522) which are
   currently `text-xs` links with no padding.
8. **One primary action per card.** The job card currently offers Map, Details,
   and a state-dependent primary in a `grid-cols-2`. The state action should
   dominate; Map and Details are secondary and can share a row beneath it.

Preserve: the `max-w-[560px]` single column, the card-per-stop structure, the
clocked-in strip, the empty state.

### 5.2 Admin dashboard — recompose (WP-4)

The rebuild since `UI-AUDIT.md` landed well. This is refinement, not a redo.

1. **Fix the orphan grid** (`page.tsx:98`): `xl:grid-cols-2` with one child.
   Either give `CashToCollect` a sibling or let it span full width.
2. **Fix the KPI row** (`operations-overview.tsx:105`): 5 cards in a 2-col
   `sm` grid orphans the fifth. Use a 6-cell layout where one cell is a
   double-width primary metric, or drop to 4 KPIs and move conversion into the
   sales card where it already appears anyway.
3. **Delete "System insights"** (`operations-overview.tsx:216-233`). Three
   sentences restating numbers already on screen. If a "needs attention" concept
   is wanted here, it should be a list of *linked, actionable exceptions*
   (unassigned jobs, jobs missing hours, overdue invoices) — which is what
   `UI-AUDIT.md` finding #1 asked for and what `ExceptionStrip` used to be.
   That is the single highest-value addition to this page.
4. **Resolve the title mismatch**: nav says "Dashboard", `h1` says "Performance
   overview". Pick one.
5. **Encode state in form, not just color.** The KPI cards differentiate
   "Clients gained" from "Clients lost" only by icon tint. Add a direction
   indicator so it survives grayscale and colorblindness.
6. **Retype KPI values to the display face** with tabular numerals. This is
   where the new face earns its keep.

Preserve: the `Suspense` + matched-skeleton pattern, `DateRangeControls`,
`TodaysRun`, `TechnicianRoutes`, the weekly revenue chart structure.

### 5.3 Landing page — recompose (WP-6, do this LAST, see §6)

> **This section is NOT the primary landing-page plan.** A browser-verified plan
> already exists and supersedes it:
> `01_Projects/Shimmer/Research/Landing Page UI Plan.md` in the owner's
> vault (dated 2026-08-14, `repo_head_at_review: 5b831d2`, decisions confirmed
> with the owner). It was written from an actual browser scan at 1440x900 and
> ~600px; this section was written from a source read only, and a source read
> cannot see what that scan found.
>
> **Work from that plan's Parts 1-3 as the spec.** In particular it caught, and
> this document missed:
>
> - the desktop `<h1>` wrapping to **five ragged lines**, putting the primary CTA
>   at y=810 on a 900px window (**below the fold**)
> - product screenshots rendering at ~570px where all UI text is **sub-pixel mush**
> - feature-tab screenshots **cropped mid-word** ("us Today Next" for "Previous
>   Today Next") from hand-set `objectPosition` values
> - `/privacy-policy` redirecting to `/login` with **no way back** — a dead end at
>   the highest-intent moment on the page. This is a functional bug, not a design
>   one; fix it independently of any design work and do not wait for WP-6.
> - `#join-beta` wasting ~380px down its entire right side
> - the pinned scroll in `mobile-showcase.tsx` costing half a viewport to reveal a
>   112px illegible phone
> - reveal animations leaving sections visibly half-populated during a normal scroll
> - no reserved height for Turnstile, so the submit button will jump in production
>
> Its **Part 3 (trust without social proof)** is the strategically load-bearing
> part and has no equivalent here. Do not dilute it.
>
> The items below are **additive** to that plan, not a substitute for it. Where
> the two disagree, the vault plan wins on layout and copy; this document wins
> only on tokens, type, and the anti-slop items listed here, which that plan does
> not cover.

1. **Zero em-dashes.** All 15, including the three metadata strings in
   `page.tsx:16-31` which also render in search results and OG cards.
2. **Cut the hero to 4 elements**: eyebrow, headline, subtext at **20 words
   max**, and **one primary CTA plus one secondary**. Move the "Early access
   includes setup help" tagline (L34) out of the hero into the beta section.
   Drop the third "Log in" link from the hero row; it is already in the nav.
   *Stacks with the vault plan's Fix 1* (widen the text column to
   `lg:grid-cols-[1.05fr_0.95fr]`, drop to `lg:text-5xl`, cut `lg:pt-28` to
   `lg:pt-16`, align `lg:items-start`). Fix 1 solves the five-line wrap; this
   item removes the two extra elements crowding the same block. Apply both, then
   run Fix 1's acceptance test: at 1440x900 both CTAs fully visible without
   scrolling and the headline at most two lines, re-checked at 1280x800 and
   1536x864.
3. **Reduce to 2 eyebrows** across the page (from 4).
4. **Break the layout repetition.** Three consecutive asymmetric text/visual
   splits. Keep one, and give the others different families: a full-bleed
   product moment, a vertical stack, or the existing bento.
5. **Remove the two decorative gradient hairlines** (L40, L46). They organize
   nothing.
6. **Move the off-token hex to tokens**: `bg-[#f1f5ff]` (L38) and the hero
   gradient (L33).
7. **Re-cut the logo mark.** `SparkMark` (L22) is grey `#707C8D` and uses
   neither brand color. Since the mark is in scope, redraw it in cobalt with a
   spark-orange facet. Keep it simple and geometric; it renders at 36px.
   *Supersedes the vault plan's Fix 9 half* ("darken `--spark-mark`"): darkening
   a grey mark on a cobalt-brand product treats the symptom. The rest of Fix 9
   (build out the footer, which currently carries one link and reads as a shell
   company) stands and is not covered here.
8. **Restyle the step numbering** (L48). The steps are a genuine sequence so the
   numbers stay, but drop the mono-caps treatment.
9. **Reformat the file.** `marketing-page.tsx` is written as a handful of
   500-character single lines. Nothing about the design requires that, and it
   makes every future edit riskier.

Preserve: real screenshots over fake UI, the honest beta framing, the absence of
fabricated social proof, `next/font`, the reduced-motion handling, the
light-only decision (`theme-provider.tsx:18-21` documents why, and it is right).

---

## 6. Sequencing, and why the landing page is last

`/public/marketing/` holds **seven real screenshots** of the current UI
(`dashboard.jpg`, `scheduling.jpg`, `my-day-home.png`, `customer-detail.jpg`,
`quote-proposal.jpg`, `invoicing.jpg`, `payroll-team.jpg`), and `dashboard.jpg`
is also the OG image.

Every one of them goes stale the moment WP-1 and WP-2 land. If the landing page
is rebuilt first, it will be rebuilt around screenshots that no longer match the
product, and will need doing twice.

The vault plan makes this constraint **stronger, not weaker**. Its Fix 2 does not
just want fresher screenshots, it wants **different ones**: tight crops of single
panels (the "Weekly revenue" card plus one KPI tile for the hero; two or three
legible day-columns for `#product`) exported as separate source images, because
a full app screenshot at ~570px is unreadable. Its Fix 3 then wants every
feature-tab image re-exported to a consistent aspect ratio so `object-contain`
has nothing to letterbox.

So the asset pass is: **re-shoot from the post-WP-5 UI, then re-crop per Fix 2,
then re-export to a uniform ratio per Fix 3.** Doing that before WP-4 and WP-5
means doing it twice against a UI that is about to change underneath it.

```
WP-1  Token foundation            (§3)   no markup changes
WP-2  Typography                  (§4)   depends on WP-1
WP-3  Raw palette conversion      (§3.4) depends on WP-1, per-file commits
WP-4  /my-day recompose           (§5.1) priority 1
WP-5  Admin dashboard recompose   (§5.2) priority 2
--    ASSET PASS: re-shoot -> re-crop (Fix 2) -> re-export (Fix 3), + OG image
WP-6  Landing page recompose      (§5.3 + vault plan Parts 1-3) priority 3
WP-7  Rewrite DESIGN.md from the shipped code (§2.7)
```

**Independent of all of the above:** the `/privacy-policy` -> `/login` dead end
(vault plan §1.4) is a functional bug on the highest-intent moment of the page.
Fix it now. It does not belong to any work package and should not wait for WP-6.

`DESIGN.md` is rewritten **last**, describing what was actually built. Rewriting
it first would just produce a fifth aspirational system.

---

## 7. Raw-palette conversion order

Highest count first. The three priority surfaces are marked.

| File | Count | |
|---|---|---|
| `employees/[employeeId]/page.tsx` | 48 | |
| `payroll/page.tsx` | 29 | |
| `my-day/my-day-client.tsx` | 27 | **priority 1** |
| `calendar/today-list-board.tsx` | 22 | |
| `customers/[customerId]/page.tsx` | 21 | |
| `jobs/[jobId]/job-detail-client.tsx` | 20 | |
| `components/ui/status-pill.tsx` | 18 | **shared, do early** |
| `invoices/[invoiceId]/page.tsx` | 18 | |
| `customers/page.tsx` | 17 | |
| `my-day/[jobId]/job-execution-client.tsx` | 16 | **priority 1** |

`status-pill.tsx` is shared across seven surfaces, so converting it early pays
out everywhere. Do it immediately after WP-1.

---

## 8. Recommendations against doing things

Stated so they are not "helpfully" done anyway.

- **Do not migrate off `lucide-react`.** 113 distinct icons across 37 files.
  General design guidance discourages Lucide, but that is about *default
  reaching* for it in new work, not about churning an established dependency in
  a shipping product. Several icons here are domain-specific
  (`Refrigerator`, `CookingPot`, `WashingMachine`, `PawPrint`, `ChefHat`) and
  would need manual remapping with real risk of wrong-icon bugs. The visible
  problem is not the family, it is the five different stroke widths. Standardize
  stroke and size (§3.3 rule 8) for ~90% of the payoff at ~5% of the risk.
  Overridable if the owner wants the swap; it is a standalone WP, not part of this one.
- **Do not add motion to the app surfaces.** `MOTION_INTENSITY` is 2-3 for a
  reason. The existing `.co-card:hover` lift (`globals.css:344-347`) currently
  applies to **every** card including non-interactive ones, which signals
  clickability that is not there. Scope it to cards that are actually links.
- **Do not restructure information architecture.** Route slugs, nav labels, and
  form field names stay. Analytics and muscle memory depend on them.
- **Do not touch payroll or invoice UI.** `HANDOFF.md` records that Square runs
  in silent mock mode in production. That gate has not moved.
- **Do not trust `DESIGN.md`** until WP-7 rewrites it. See §2.7.

---

## 9. Acceptance

Per work package: `npm run verify` green, one commit, explicit paths staged.

Global checks before calling the refinement done:

- [ ] Zero raw Tailwind palette utilities in `src/` (was 542)
- [ ] Zero hex literals in `src/**/*.tsx` outside the device-frame mock
- [ ] Zero `rgba(0,108,73,...)` or `#006c49` anywhere (was 8 sites)
- [ ] `--co-evergreen` appears nowhere
- [ ] The `globals.css:473` attribute-selector hack is deleted
- [ ] Every surface screenshotted in **both** themes, no light islands in dark
- [ ] No text under 13px on `/my-day`; body is 16px
- [ ] All interactive targets on `/my-day` are >= 44x44px
- [ ] Zero em-dashes in `src/components/marketing/**` and `src/app/page.tsx`
- [ ] One radius scale; zero `rounded-[Npx]` (was 28)
- [ ] One icon stroke width (was 5)
- [ ] Contrast spot-check reproduces the §3 ratios in both themes
- [ ] No dark-mode flash on load
- [ ] `DESIGN.md` describes the code that shipped

---

## 10. A note on what is already good

The app is further along than `UI-AUDIT.md` (2026-07-26) suggests. The dashboard
rebuild landed, the status-pill consolidation landed, the dead UI is gone. The
`Suspense`/skeleton discipline is genuinely good, the dark-mode token comments in
`globals.css:438-491` are the work of someone who measured contrast rather than
guessed, and the decision to scope `.dark` to the app shell and keep marketing
light-only is correct and well-reasoned.

The problem is not craft. It is that four systems accumulated and none was ever
retired. That is what this handoff retires.
