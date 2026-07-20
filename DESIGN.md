---
name: CleanOps Operations Desk
description: A calm, practical operations workspace for cleaning teams.
colors:
  shell-ink: "#1c1917"
  shell-ink-soft: "#2e2621"
  clay-accent: "#c1592c"
  clay-accent-soft: "#a84a22"
  clay-tint: "#f3e2d6"
  on-dark-accent: "#e8a06e"
  page-background: "#f7f3ec"
  surface: "#ffffff"
  surface-muted: "#f1ece2"
  ink: "#221d1a"
  muted: "#756b60"
  faint: "#9a8f81"
  line: "#e6ddd0"
  line-soft: "#efe9de"
  success: "#4d7a3f"
  warning: "#b8791f"
  danger: "#b23b2e"
  input-border: "#ddd2c0"
  input-placeholder: "#a89b89"
  input-border-hover: "#c9bba5"
  input-focus: "#c1592c"
  focus-ring: "rgba(193, 89, 44, 0.35)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 2.5vw, 2.45rem)"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.16em"
    fontFeature: "uppercase labels only"
  compact-control:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    lineHeight: 1.35
rounded:
  sm: "0.65rem"
  md: "0.875rem"
  lg: "1.1rem"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.shell-ink}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1rem"
    height: "2.55rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 1rem"
    height: "2.55rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.65rem 0.8rem"
    height: "2.55rem"
---

# Design System: CleanOps Operations Desk

## 1. Overview

**Creative North Star: "The Quiet Control Room"**

CleanOps is designed as a calm control room for a busy cleaning company. It should help someone make the next correct decision quickly: assign the job, understand the customer, record time, send the quote, review payroll, or resolve an exception. The interface uses a warm charcoal shell and a restrained paper-toned workspace so the product feels grounded, human, and operational rather than decorative or like a generic AI-generated SaaS template.

The system is modern, efficient, and practical. It uses clear hierarchy, generous use of the available frame, compact data presentation where scanning matters, and direct language. Field users need one-handed mobile interactions and large, obvious actions; office users need wide tables, readable filters, and enough room to see the operation without artificial squeezing.

This system explicitly rejects flashy UI, eye-catching decoration for its own sake, generic AI-generated SaaS patterns (no blue/violet gradients, no glassmorphism, no icon-grid dashboards), ornamental animation, crowded dashboards, and interactions that make routine work take more taps.

**Key Characteristics:**

- Warm charcoal navigation shell (`#1c1917`) with a single confident clay/terracotta action accent (`#c1592c`), used sparingly.
- White operational surfaces over a warm paper page field (`#f7f3ec`) — not cool gray, not stark white.
- One typeface family throughout (Geist Sans for display and body, Geist Mono for tabular/technical values) — no competing font stacks.
- Tight, readable typography with restrained display scale.
- Flat-by-default surfaces with subtle structural depth.
- Responsive layouts that expand into the available desktop frame and collapse into task-first mobile flows.

## 2. Colors

The palette pairs a warm near-black shell with a single terracotta/clay accent and a warm paper workspace — deliberately avoiding the blue/indigo/violet and lime-on-green combinations common to generic AI-SaaS dashboards.

### Primary

- **Shell Ink** (#1c1917): Navigation shell, hero panels on the public quote page, and high-confidence dark surfaces.
- **Shell Ink Soft** (#2e2621): Secondary dark surfaces and supporting navigation states.
- **Clay Accent** (#c1592c): Brand signal, active navigation marker, and rare action emphasis (e.g. selected quote tier, accept button on the public proposal). Use sparingly so it stays meaningful.
- **On-Dark Accent** (#e8a06e): The lighter clay tint used for accent text sitting on the dark shell (where the raw clay accent would lack contrast).

### Neutral

- **Page Paper** (#f7f3ec): The main workspace background — warm off-white, not cool gray.
- **Surface White** (#ffffff): Cards, forms, tables, and focused content surfaces.
- **Muted Surface** (#f1ece2): Secondary panels, table headers, empty states, and low-emphasis grouping.
- **Operational Ink** (#221d1a): Primary text and high-contrast headings.
- **Muted Text** (#756b60): Supporting copy, metadata, and secondary labels.
- **Faint Text** (#9a8f81): Low-emphasis labels and navigation section markers.
- **Line** (#e6ddd0): Structural borders and card edges.
- **Soft Line** (#efe9de): Table dividers and subtle separation.
- **Success** (#4d7a3f): Completed and healthy states.
- **Warning** (#b8791f): Needs-attention states and review prompts.
- **Danger** (#b23b2e): Failed, overdue, or blocked states.

### Named Rules

**The Rare Clay Rule.** Clay/terracotta is the action signal, not a background color for whole pages or a repeated decorative tint. If every element is highlighted, nothing is actionable.

## 3. Typography

**Display Font:** Geist Sans (with ui-sans-serif and system fallbacks)

**Body Font:** Geist Sans (with ui-sans-serif and system fallbacks)

**Label/Mono Font:** Geist Mono is available for technical values, IDs, and integration details when tabular alignment is useful.

**Character:** The type system is compact, neutral, and highly legible. Tight tracking on page titles gives the app a considered product voice without turning operational screens into editorial posters. Only one sans family is loaded across the app — no competing fonts silently overriding each other.

### Hierarchy

- **Display** (650, `clamp(1.75rem, 2.5vw, 2.45rem)`, 1.05): Page titles such as Dashboard, Jobs, Reports, and Settings.
- **Headline** (600, 1.125rem, 1.25): Section titles, drawer headings, and important panel headings.
- **Title** (600, 0.9375rem, 1.35): Row titles, button labels, and important field values.
- **Body** (400, 0.875rem, 1.5): Operational descriptions, table text, and instructional copy. Keep long prose within roughly 65–75ch.
- **Label** (700, 0.6875rem, 1, 0.16em tracking, uppercase only when used as a metadata marker): Eyebrows, compact status labels, and navigation group labels.

### Named Rules

**The Scan Before Read Rule.** Use size, weight, spacing, and alignment to make the important value visible before the supporting explanation.

## 4. Elevation

CleanOps uses a hybrid of tonal layering and restrained shadows. Most surfaces are defined by a border and a slight tonal difference; shadows are reserved for interactive lift, major shells, and focused login surfaces. Depth must support hierarchy, never become decoration.

### Shadow Vocabulary

- **Card Rest:** `0 1px 0 rgba(28, 25, 23, 0.03), 0 12px 30px rgba(28, 25, 23, 0.035)`: Default for the reusable `.co-card` surface.
- **Card Hover:** `0 1px 0 rgba(28, 25, 23, 0.03), 0 16px 34px rgba(28, 25, 23, 0.06)`: Only for motion-enabled hover states.
- **Primary Action:** `0 8px 18px rgba(28, 25, 23, 0.09)`: Gives the primary button a small amount of tactile priority.

### Named Rules

**The Structural Depth Rule.** Use borders and tonal layering first; use shadows only when an element needs to feel lifted or interactive.

## 5. Components

### Buttons

- **Shape:** Gently rounded operational controls (10.4px / `0.65rem`), never oversized pills except for status chips.
- **Primary:** Shell Ink background, white text, 600–700 weight, 0.65rem × 1rem padding, minimum 2.55rem height.
- **Hover / Focus:** Dark shell shifts slightly lighter on hover; focus uses the shared clay-tinted 3px outline. Active buttons move down 1px.
- **Secondary / Ghost:** White surface with a warm tan border and ink text. Ghost actions use transparent backgrounds and become lightly muted on hover.

### Chips

- **Style:** Full-pill radius, compact padding, and a tinted semantic background. Use green for healthy/completed, amber for review, and rust/red for failures or overdue states.
- **State:** Selected filters use a stronger border/background contrast; unselected filters remain quiet and readable.

### Cards / Containers

- **Corner Style:** 17.6px (`1.1rem`) for primary cards; 14px or 10.4px for smaller grouped surfaces.
- **Background:** White against the paper page background; muted warm-tan for supporting groups.
- **Shadow Strategy:** Use the Card Rest vocabulary and avoid pairing a decorative heavy shadow with a border.
- **Border:** 1px `#e6ddd0` for structural cards; `#efe9de` for internal dividers.
- **Internal Padding:** Start at 1.25rem; use 1rem for dense tables and 1.5–2rem for major page sections.

### Inputs / Fields

- **Style:** White background, 1px warm tan border, 10.4px radius, minimum 2.55rem height, and 0.65rem × 0.8rem padding.
- **Focus:** Border shifts to the clay focus color and receives a subtle clay-tinted ring.
- **Error / Disabled:** Use explicit text and semantic color; never rely on a red border alone. Disabled controls reduce contrast and interaction affordance without disappearing.

### Navigation

- **Desktop:** Fixed 18rem warm-charcoal rail with a compact CleanOps mark, grouped workspace links (lucide-react icons), and a lower control-room section for integrations/settings.
- **Active:** A low-contrast white surface with white text and a small clay vertical marker. The marker is a navigation state, not a card decoration.
- **Mobile:** Sticky charcoal horizontal navigation with the brand mark and scrollable links. Keep the employee view focused on My day rather than exposing office navigation.

### Data Tables

- **Density:** 0.75–1rem cell padding, left-aligned text, and horizontal overflow on narrow screens rather than clipped columns.
- **Headers:** Muted surface background, small semibold labels, restrained tracking.
- **States:** Use links for drill-down values and semantic chips for status; keep actions at the row edge.

## 6. Do's and Don'ts

### Do:

- **Do** use the full available frame for calendars, reports, and operational tables; do not squeeze data into a narrow centered column.
- **Do** make the next action obvious for a cleaner on mobile, especially travel, arrival, clock-in, break, completion, and undo.
- **Do** use `#1c1917` for navigation and primary actions, `#c1592c` for rare action emphasis, and `#f7f3ec` for the workspace field.
- **Do** keep touch targets generous and content readable on a phone.
- **Do** support reduced motion and preserve important content without animation.
- **Do** use clear empty, loading, error, and attention states with text, not color alone.

### Don't:

- **Don't** make CleanOps flashy, decorative, noisy, or like a generic AI-generated SaaS dashboard.
- **Don't** use excessive gradients, ornamental animation, over-rounded cards, crowded layouts, or unnecessary metrics.
- **Don't** use blue/indigo/violet as an accent — this system commits to a single warm clay/terracotta accent instead.
- **Don't** make routine work take more taps than necessary.
- **Don't** use colored side-stripe borders greater than 1px as card decoration.
- **Don't** use gradient text, decorative grid backgrounds, repeating stripe backgrounds, or glassmorphism as defaults.
- **Don't** build identical grids of icon-plus-heading cards when a table, list, or direct layout communicates better.
- **Don't** use color as the only way to communicate job, payment, payroll, or sync status.

## 7. Wave 1 Notes (implementation record)

Wave 1 of the redesign (app shell, dashboard, public quote page) replaced the prior evergreen/lime palette and the four-competing-fonts setup with this system. Screens outside Wave 1 scope (jobs, customers, invoices, employees, payroll, reports, settings, my-day) still reference the same `--co-*` CSS custom properties in `src/app/globals.css`, so they inherited the new palette automatically without code changes — but their layout/markup has not yet been rebuilt with shadcn primitives and should be treated as due for a later wave.
