# ServiceSpark design system

This describes the design system as it actually exists in `src/` as of the
`design/wp7-design-md-rewrite` branch (based on `design/wp6-landing-page`,
commit `6212425`). It replaces a prior version of this file that documented a
Material-style token set (`surface-container-*`, `on-surface`,
`primary-fixed`, a green `#f4fbf4` surface, a `1rem`/`1.5rem` radius scale)
that never existed in the code. That document was aspirational and caused
real drift; this one is written from the shipped CSS and components, and it
says so explicitly where the two disagree with reality.

Written after `HANDOFF.design-refinement.md`'s WP-1 through WP-6 shipped
(tokens → typography → palette conversion → `/my-day` → admin dashboard →
asset pass → landing page). This is WP-7, the last work package, done last on
purpose: rewriting this file first would have just produced a fifth
aspirational system. If you're an agent about to make a design change, read
the **Known gaps** section before touching anything — it lists exactly what
still contradicts this document and why it wasn't fixed.

---

## Two-audience system

Three surfaces, three densities, one shared token layer:

- **`/my-day`** — phone-first field tool, used one-handed, outdoors, mid-shift.
  16px body text floor, nothing under 13px, 44×44px minimum touch targets.
  Uses the `type-field-*` scale.
- **Admin console** (dashboard, calendar, jobs, customers, employees,
  payroll, settings, etc.) — dense desktop operations console. Uses the
  `type-admin-*` scale where it's been applied (currently just the dashboard
  KPI row — see Known gaps).
- **Landing page** (`src/app/page.tsx`, `src/components/marketing/**`) —
  light-only B2B marketing page. `.dark` is deliberately scoped to the
  authenticated app shell only and is never applied to marketing or public
  pages (`theme-provider.tsx` documents why).

Brand colors (`#2457ff` cobalt, `#e4942b` spark orange) are locked across all
three surfaces. Everything else — layout, density, type scale, motion — is
allowed to differ by surface, and does.

---

## Tokens

All real tokens live in `src/app/globals.css`, defined on `:root` (light) and
overridden on `.dark` (dark). Every color below is the value actually in the
file, not a description of intent.

### Brand (locked, do not retune)

```css
--co-brand-cobalt: #2457ff;
--co-brand-spark:  #e4942b;   /* fill and graphics only — fails WCAG AA as text */
```

### Accent, split by role (light / dark)

The split into `-fill`/`-text`/`-tint` exists because one token can't
simultaneously be "white text on a solid fill" and "small text on a light
surface" at AA contrast in both themes. This split is what makes the
dark-mode attribute-selector hack in Known gaps obsolete for *new* code —
it's just not been retrofitted everywhere yet.

| Token | Light | Dark |
|---|---|---|
| `--co-accent-fill` | `#2457ff` | `#1e47cc` |
| `--co-accent-fill-hover` | `#1737a8` | `#1737a8` |
| `--co-accent-text` | `#2457ff` | `#8fb0ff` |
| `--co-accent-tint` | `#edf1ff` | `#18213d` |
| `--co-spark-fill` | `#e4942b` | `#e4942b` |
| `--co-spark-text` | `#96590a` | `#e9a94f` |
| `--co-spark-tint` | `#fdf3e4` | `#33240f` |

### Neutrals

| Token | Light | Dark |
|---|---|---|
| `--co-bg` | `#f4f6fb` | `#0b1020` |
| `--co-surface` | `#ffffff` | `#141a2c` |
| `--co-surface-muted` | `#edf0f8` | `#1c2338` |
| `--co-surface-muted-2` | `#e0e5f2` | `#262f47` |
| `--co-ink` | `#141a2e` | `#e9edf7` |
| `--co-body` | `#414a63` | `#a7b1c9` |
| `--co-faint` | `#5c6580` | `#8f99b4` |
| `--co-line` | `#c9d0e2` | `#2f3743` |
| `--co-line-soft` | `#e4e8f2` | `#242b35` |

`--co-muted` (`#4b587a` / `#9aa5c7`) also exists alongside `--co-body` and
`--co-faint` — three neutral text tokens with overlapping purpose, not fully
reconciled. `--co-surface-muted-strong` (`#dbe5ff` / `#232b47`) exists too,
used narrowly.

### Semantic (independent of accent)

| Token | Light | Dark |
|---|---|---|
| `--co-success` | `#1f7a3a` | `#4fbf6d` |
| `--co-warning` | `#8a5a00` | `#dda13c` |
| `--co-danger` | `#b03024` | `#e8756a` |

**These are flat values — no `-fill`/`-text`/`-tint` triad exists for them**,
unlike accent/spark. See Known gaps: badges work around this with
`color-mix()` at render time instead of a precomputed tint token.

### Radius

Two-value scale, plus a pill for status only:

```css
--co-radius-control: 0.5rem;   /* 8px — buttons, inputs, chips */
--co-radius-card:    0.75rem;  /* 12px — cards, panels, popovers */
```

`--radius-full: 9999px` (Tailwind theme key) covers pills. **28 off-scale
`rounded-[Npx]` instances remain outside this scale** — see Known gaps for
the exact count and locations.

### Other live tokens worth knowing

- `--co-evergreen` / `--co-evergreen-soft` — still defined and still the
  single most-used accent token in components (`#2457ff` / `#1737a8` light,
  `#5b82ff` / `#3a5cd6` dark). The name is a leftover from a pre-cobalt green
  brand; the value is cobalt. Not retired — see Known gaps, this is the
  largest unresolved item in this document.
- `--co-tint-base` — anchors `color-mix()` badge tints to the current
  surface (`white` in light, `var(--co-surface)` in dark) so tinted badges
  actually darken with the theme instead of staying a pale near-white chip.
- `--spark-mark` / `--spark-mark-facet` — the two-tone logo mark colors
  (`#707C8D`/`#FCFCFA` light, `#8b95ab`/`#f6f7fb` dark), used by the login
  screen and nav badge. The landing page's own `SparkMark` was recut in
  cobalt + spark-orange during WP-6 and no longer uses these two tokens —
  it now uses the real brand colors directly, which is the direction this
  token pair should probably also move in.
- A parallel, mostly-vestigial shadcn token set (`--background`,
  `--primary`, `--ring`, `--chart-*`, `--sidebar-*`) still exists for
  Tailwind's generated utility classes and shadcn-derived components. Most
  of these now alias to `--co-*` values (e.g. `--ring: var(--co-accent-fill)`)
  rather than carrying independent green values — WP-1 reconciled the worst
  of it (the green `oklch()` dark-mode values are gone), but the token set
  itself is still doubled up with `--co-*` rather than collapsed into it.

---

## Typography

Three type families, real usage:

- **Archivo** (`--font-archivo`) — display face. `h1`/`h2`, `.page-title`,
  and the `type-*-display`/`type-*-title` classes.
- **Inter** (`--font-inter`) — body face, the `html` default via
  Tailwind's `font-sans`.
- **JetBrains Mono** (`--font-jetbrains-mono`) — reserved for genuine machine
  data (IDs, codes, timestamps) and `.eyebrow`. WP-2's stated intent was to
  cut mono usage down from the old liberally-applied `.eyebrow` pattern;
  several eyebrows were deleted outright in WP-4/WP-6 rather than restyled.

The old naming lie is gone: `--font-geist-sans`/`--font-geist-mono` (which
actually held Inter, not Geist) have been renamed to `--font-inter` /
`--font-jetbrains-mono` / `--font-archivo`. Zero `font-geist` references
remain in `src/`.

### Type scale

Two scales for two reading distances, both defined in `globals.css`:

```css
/* Admin console (dense, desktop) */
.type-admin-display { font-family: var(--font-display); font-size: 1.875rem; line-height: 2.25rem; }  /* 30/36 */
.type-admin-title   { font-family: var(--font-display); font-size: 1.25rem;  line-height: 1.75rem; }  /* 20/28 */
.type-admin-body    { font-size: 0.875rem;  line-height: 1.25rem; }                                     /* 14/20 */
.type-admin-meta    { font-size: 0.8125rem; line-height: 1.125rem; }                                    /* 13/18 */
.type-admin-micro   { font-size: 0.75rem;   line-height: 1rem; }                                        /* 12/16 */

/* Field / my-day (phone, arm's length) */
.type-field-display { font-family: var(--font-display); font-size: 1.5rem;    line-height: 1.875rem; } /* 24/30 */
.type-field-title   { font-family: var(--font-display); font-size: 1.1875rem; line-height: 1.625rem; } /* 19/26 */
.type-field-body     { font-size: 1rem;      line-height: 1.5rem; }                                     /* 16/24 — baseline */
.type-field-meta     { font-size: 0.875rem;  line-height: 1.25rem; }                                    /* 14/20 */
.type-field-micro    { font-size: 0.8125rem; line-height: 1.125rem; }                                   /* 13/18 */
```

`type-admin-*` and `type-field-*` classes carry font size/line-height/family
only — they do not set `font-weight`, so callers add `font-semibold`/`font-bold`
explicitly (confirmed in the dashboard KPI conversion, which kept
`font-semibold` alongside `type-admin-display`).

**Actual rollout is narrower than the scale's existence suggests**: as of
this branch, `type-admin-*` is applied in exactly one file
(`dashboard/operations-overview.tsx`, the KPI row) and `type-field-*` in
exactly one file (`my-day/my-day-client.tsx`). The rest of the admin console
still uses ad hoc Tailwind text-size utilities rather than the admin scale —
the scale is real and correct, but most of the app hasn't been migrated onto
it yet. Treat this as the target scale for any admin surface you touch next,
not as something already applied app-wide.

The field floor is real and enforced where the scale has been applied:
nothing on `/my-day` is smaller than 13px, and body text there is 16px, not
the 12px-and-under sizes the pre-WP-4 audit found.

---

## Component patterns

Real reusable classes from `globals.css`:

- **`.co-card`** — `border: 1px solid var(--co-line-soft)`, `border-radius:
  var(--co-radius-card)`, white/surface background, soft shadow. Hovers lift
  1px with a stronger shadow under `prefers-reduced-motion: no-preference`.
  This hover currently applies to *every* `.co-card`, including
  non-interactive ones — the design contract flagged this as a
  clickability-signal bug still open (not fixed in this branch).
- **`.co-button-primary`** — solid `--co-accent-fill` background, white text,
  `--co-radius-control` corners, `font-size: 0.8rem` (12.8px), `font-weight:
  700`. Hover darkens to `--co-accent-fill-hover`.
- **`.co-button-secondary`** — white/surface background, `--co-line` border,
  `--co-muted` text, same radius and font metrics as primary.
  **Known bug** (found and worked around during WP-3, not fixed at the
  source): combining `.co-button-secondary` with a Tailwind color utility
  (e.g. `border-red-300 text-red-600`) silently loses the color, because
  `.co-button-secondary`'s own `border`/`color` declarations sit later in
  the cascade than Tailwind's generated utilities at equal specificity. The
  workaround used at every call site so far is Tailwind's `!` important
  modifier (e.g. `!text-red-600`), not a fix to the class itself.
- **`.co-input`** — `--co-input-bg` background, no border at rest, focus ring
  via `--co-focus-ring`, `--co-radius-control` corners.
- **`.co-date-input` / `.co-time-input`**, **`.co-date-popover`**,
  **`.co-date-nav`**, **`.co-date-day`** / **`.co-date-day-selected`** —
  custom date/time picker chrome, all keyed to the same token set.
- **`.co-badge-*`** — status badges. **Seven tones**, not the original five:
  `success`, `warning`, `danger`, `info`, `spark`, `muted`, `neutral`. All but
  `neutral`/`muted` use `color-mix(in srgb, <token> 10%, var(--co-tint-base))`
  for the background and `24%` for the border, keyed off the semantic token's
  single flat value (there's no dedicated tint token to mix from — see Known
  gaps). `info` and `spark` were added during WP-3 to cover cases the
  original five-tone set didn't anticipate (accent-colored and spark-colored
  statuses that aren't literally success/warning/danger).
- **`.eyebrow`** — mono, uppercase, letter-spaced. Usage was deliberately cut
  during WP-4/WP-6; most eyebrows on `/my-day` and the landing page were
  deleted rather than kept and restyled.
- **`.page-title`** / **`.page-subtitle`** — the display-face page header
  pattern used across the admin console.

---

## Icon convention

`lucide-react`, 113 distinct icons across 37 files (not migrated, and the
design contract explicitly recommends against migrating off it — several
icons are domain-specific and the risk of a wrong-icon bug from a blind
family swap outweighs the stylistic win).

**Stroke width is not standardized.** Explicit `strokeWidth` props currently
in `src/**/*.tsx`:

| Value | Count | Where |
|---|---|---|
| `1.75` | 10 | `theme-toggle.tsx` (4), `app-nav.tsx` (3), `settings-nav.tsx` (2), `surface-switcher.tsx` (1) |
| `2` | 5 | `app-nav.tsx` (3), `surface-switcher.tsx` (1), `create-menu.tsx` (1) |
| `3` | 7 | `marketing-page.tsx` only |
| `2.2` | 1 | `feature-bento.tsx` |
| `1.8` | 1 | `notifications-menu.tsx` |

`1.75` is the plurality among app-shell chrome icons (nav, theme toggle,
settings nav) and is the value the design contract recommends standardizing
on. It has not been enforced — the landing page alone accounts for 7
`strokeWidth={3}` instances, and one-off `2.2`/`1.8` values remain elsewhere.
The overwhelming majority of icon instances (113 icons, only 24 with an
explicit override above) render at lucide-react's implicit default of `2`,
so in practice the app runs on a mix of an unset default (`2`) plus five
explicit overrides. Two sizes are used, 16px inline and 20px standalone, per
the original contract's recommendation — not independently re-verified here.

---

## Known gaps

This section exists on purpose. It documents what's real and unresolved,
not what should eventually be true — the same philosophy the whole
design-refinement effort was built on. An agent reading this file should
come away knowing exactly what NOT to assume is fixed.

- **`--co-evergreen` is not retired.** WP-1's own commit message logged this
  as explicitly out of scope (retiring it needs markup edits, and WP-1 was
  scoped to "no markup changes"). A follow-up note after WP-3 logged 86
  usages remaining. **A full sweep of `src/` on this branch finds 316 lines
  / 363 occurrences of `co-evergreen` across 85 `.tsx`/`.ts` files** (plus
  16 references inside `globals.css` itself, which are the token
  definitions and the hack described below, not call sites to convert).
  The gap between 86 and 363 is almost certainly because the earlier count
  was scoped to files WP-3 touched or read closely, not a full-tree grep —
  WP-3's per-file conversion list (§7 of the design contract) never
  included `app-nav.tsx`, the settings pages, most of `calendar/*`, or
  several other files that are heavy `text-[var(--co-evergreen)]` users.
  Functionally these call sites are not broken — `--co-evergreen` resolves
  to the same cobalt value as `--co-accent-fill`/`--co-accent-text` in both
  themes — but the name is still a lie, and this is the single largest
  unresolved mechanical cleanup left in the codebase.
- **The dark-mode attribute-selector hack is still in `globals.css`,
  currently at lines 510 and 528** (`.dark [class~="bg-[var(--co-evergreen)]"]
  [class~="text-white"]` and its `:hover` sibling). It's still load-bearing:
  every `bg-[var(--co-evergreen)] text-white` call site in the app (there
  are dozens, per the count above) depends on it to render correctly in dark
  mode, because `--co-evergreen` alone can't satisfy AA contrast as both a
  solid fill under white text and small accent text at once. The fix
  (`--co-accent-fill`/`--co-accent-text` split) already exists in the token
  layer — what's missing is renaming every `bg-[var(--co-evergreen)]
  text-white` call site onto `--co-accent-fill` directly, which is exactly
  the `--co-evergreen` retirement above. The hack is unlayered CSS
  (deliberately, so it beats Tailwind's `@layer utilities` output) and is
  documented in-place with a long comment explaining exactly why removing it
  without doing the rename first will break dark mode broadly.
- **`--co-ink` is unsafe as a solid-fill background.** It's built to invert
  between themes (near-black in light, near-white in dark) — correct for
  text, but it will silently produce white-on-white (or black-on-black) if
  used as a button/pill/chip fill instead of as a text color. This was
  caught live during WP-3 on `customers/page.tsx`'s "Hide archived" filter
  before it shipped, fixed at that one call site with `bg-[var(--co-faint)]
  text-[var(--co-surface)]` (two tokens that invert together, so contrast
  holds in both directions). **Rule for any future session:** never use
  `--co-ink` (or any other token whose job is text-on-surface contrast) as a
  `bg-*` fill. Only tokens designed as fills (`--co-accent-fill`,
  `--co-warning`, `--co-danger`, `--co-spark-fill`) are safe for that. There
  is no lint rule enforcing this — it's a trap a future session can still
  walk into.
- **No dedicated tint/fill token exists for `--co-success`/`--co-warning`/
  `--co-danger`.** Unlike accent and spark, which each got a full
  `-fill`/`-text`/`-tint` triad in WP-1, the three semantic colors are a
  single flat value each. Every tinted badge or box built from them computes
  its tint at render time with `color-mix(in srgb, <token> N%,
  var(--co-tint-base))` instead of reading a precomputed token. This is why
  `.co-badge-*` grew from the original 5 tones to 7 during WP-3 (`info` and
  `spark` added) — the token set didn't anticipate needing that many
  distinguishable statuses when it was designed.
- **`.co-button-primary`/`.co-button-secondary`'s shared base font size is
  `0.8rem` (12.8px)**, which sits under the 13px field floor `/my-day`
  otherwise enforces. Both classes are used on every surface, not just
  `/my-day`, so WP-4's my-day-scoped recompose deliberately didn't touch
  them — bumping the shared base affects the whole app; adding a
  field-specific override is scoped but adds a second button size system.
  Neither has been decided yet.
- **28 off-scale `rounded-[Npx]` instances remain**, unchanged since the
  original audit: `app-nav.tsx` (`rounded-[14px]` ×10, `rounded-[18px]` ×3),
  `quote/[token]/page.tsx` (`rounded-[28px]` ×8, `rounded-[32px]` ×2),
  `settings-nav.tsx` (`rounded-[14px]` ×2), `feedback/[token]/page.tsx`
  (`rounded-[28px]` ×1), `surface-switcher.tsx` (`rounded-[14px]` ×1),
  `employees/[employeeId]/page.tsx` (`rounded-[14px]` ×1). None of these
  collapse onto `--co-radius-control`/`--co-radius-card` yet.
- **181 raw Tailwind palette utilities remain** in `src/**/*.tsx` (down from
  542 before WP-1/WP-3), across 59 files. By hue: rose 90, amber 58, emerald
  24, slate 14, violet 6, blue 1, sky 1. This is expected, not a regression:
  `payroll/page.tsx` (12 remaining) and `invoices/[invoiceId]/page.tsx` (8
  remaining) were explicitly excluded from WP-3's conversion pass per the
  "don't touch payroll or invoice UI" rule (Square runs in silent mock mode
  in production; that gate hasn't moved). The rest are spread across files
  WP-3's per-file conversion list never covered — sibling component files
  under directories whose main page *was* converted (e.g.
  `employees/[employeeId]/page.tsx` is clean, but `employee-tags.tsx`,
  `pending-pto-requests.tsx`, `photo-upload.tsx`, and `pto-editor.tsx` in the
  same directory are not), plus calendar chrome (`day-board.tsx`,
  `week-board.tsx`, `staff-board.tsx`, and others that only got a one-line
  border-utility fix when `shared.ts`'s `APPOINTMENT_COLOR` constants moved
  to `.co-badge-*`, not a full conversion), plus settings pages, quotes, and
  several other surfaces never in scope for WP-3's file list. `calendar/shared.ts`
  also still carries a raw `sky`/`emerald`/`violet` legend
  (`APPOINTMENT_TYPE_COLORS` or equivalent, lines 10–12) for job-type
  badges, out of scope for the same reason.
- **75 hex literals remain in `src/**/*.tsx`** outside the one legitimate
  device-frame mock (`components/marketing/phone-frame.tsx`, 5 literals,
  genuinely a physical-device chrome color and correctly out of scope).
  Concentrated in the Job Detail page's card family
  (`jobs/[jobId]/job-detail-client.tsx` 26, `loading.tsx` 13,
  `time-entries-panel.tsx` 8, `team-panel.tsx` 6, `handoff-panel.tsx` 2) —
  these are the green-gray literals (`#d3e0d2`, `#cad6ca`, `#d5ded5`,
  `#f7fbf5`, and similar) from the pre-cobalt era, explicitly flagged as
  out-of-scope for WP-3's raw-*hue*-utility pass since hex literals are a
  different mechanical sweep. Smaller isolated pockets also remain in
  `settings/branding/page.tsx`, `settings/ghl/page.tsx`,
  `calendar/route-preview.tsx`, `scores/page.tsx`, `quality/page.tsx`,
  `sync-issues/page.tsx`, `employee-browser/*`, and
  `recurring/new/cadence-section.tsx` — mostly the same `#14211f` dark-green
  ink value or `#e4f1e7`/`#d9e5cf`-family green tints, none yet converted to
  `--co-*` tokens.
- **`calendar/shared.ts`'s `EMPLOYEE_PALETTE`** is a 16-color hardcoded hex
  array used to assign distinguishable per-employee colors on calendar
  views. This is a deliberate categorical palette for telling technicians
  apart at a glance, not a brand-token violation — noted here so a future
  session doesn't "fix" it into brand tokens and collapse the
  distinguishability it exists for.
- **Icon stroke width is not standardized**, despite the design contract's
  recommendation to converge on `1.75`. See the Icon convention section
  above for the real current distribution.
- **`.co-card:hover`'s lift/shadow applies to every card**, including
  non-interactive ones, which signals clickability where none exists. Not
  scoped to actual links yet.
- **Three overlapping neutral text tokens** (`--co-body`, `--co-faint`,
  `--co-muted`) exist without a clearly documented boundary between their
  intended uses.

---

## What's deliberately not covered here

- `payroll/page.tsx` and `invoices/[invoiceId]/page.tsx` are frozen by
  policy (Square silent mock mode), not by neglect. Don't "fix" their raw
  palette usage without lifting that gate first.
- The public marketing screenshots in `public/marketing/*` were re-shot,
  re-cropped, and re-exported to a uniform ratio during the WP-5→WP-6 asset
  pass. They are current as of this branch; they will go stale again the
  next time any priority-surface UI changes materially, the same way the
  pre-WP-1 screenshots did.
