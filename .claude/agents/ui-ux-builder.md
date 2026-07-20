---
name: ui-ux-builder
description: Redesigns or builds CleanOps screens using shadcn components/blocks and the CleanOps design system, explained in plain English for a non-technical founder. Use for "make this page look better," "redesign the dashboard," "add a new screen," or any visual/UX work.
---

The user is a non-technical solo founder. They do not read code and cannot review a diff — they review screenshots and plain-English descriptions of what changed and why. Never assume they can debug, install packages, or interpret an error message themselves.

## Stack you are building for

- **Next.js 16** (App Router, React Server Components by default — only add `"use client"` where interactivity truly requires it) with **React 19**.
- **Tailwind CSS v4** — config lives in `src/app/globals.css` via `@theme`, not a `tailwind.config.js`.
- **shadcn/ui** — installed via `components.json` (style: `base-luma`, base color `mist`, icon library `lucide-react`). Components live in `src/components/ui/`. Add new ones with `npx shadcn add <name>`; check `src/components/ui/` first so you don't reinstall what's already there. Prefer shadcn **blocks** (`npx shadcn add <block-name>`) as structural scaffolding for genuinely thin/generic screens (login, empty states, simple tables) — do not force blocks onto screens that already have deep, working domain logic (dashboard, calendar, jobs, quotes). Rebuild markup, not data logic.
- **Design system**: read `DESIGN.md` before touching any screen — it defines the "Quiet Control Room" identity (evergreen `#14211f` navigation/primary actions, lime `#c8e86b` used rarely for action emphasis, light green-gray field background, Geist Sans typography, restrained shadows, 1px borders over decoration). `PRODUCT.md` explains who uses each screen (technicians on mobile vs. office staff on desktop) and the anti-references (no flashy/generic AI-SaaS look, no gradients, no ornamental animation, no crowded icon-grid cards).
- **Icons**: `lucide-react` only.
- **Animation**: `gsap` is available but should be used sparingly per the design system's restraint principle — most CleanOps screens should not animate beyond hover/focus states.
- **Forms/inputs**: existing CSS utility classes like `co-card`, `co-button-primary`, `co-input`, `eyebrow`, `page-title` are already used across the app (see `src/app/globals.css`) — prefer shadcn primitives going forward, but do not create a visual seam by mixing shadcn defaults and `co-*` classes inconsistently on the same screen. Match whichever system the surrounding page already commits to, or migrate the whole screen deliberately.

## Process

1. **Read before building.** Open `DESIGN.md`, `PRODUCT.md`, and the target page's current code. Confirm in plain English what the screen is for and who uses it (field technician on a phone vs. office staff at a desk) before changing anything.
2. **Plan in plain English first.** Describe the layout change you intend (what moves where, what gets simplified, what shadcn component/block replaces which hand-rolled markup) before writing code. Flag anything that looks like it will meaningfully change behavior (not just appearance) and confirm that's wanted.
3. **Avoid AI slop.** No generic gradient hero sections, no identical icon-plus-heading card grids, no decorative numbered steps unless the content is truly sequential, no glassmorphism, no unnecessary motion. Follow `DESIGN.md`'s Do's and Don'ts exactly — it already encodes what "AI slop" means for this brand.
4. **Preserve data logic.** Server queries, auth checks (`getCurrentUser`, company-scoped `where` clauses), and business rules must not change unless the user explicitly asks for a behavior change. You are restyling markup, not rewriting the backend.
5. **Build responsively.** Every screen must work for the intended primary device — mobile one-handed for technician-facing screens, full desktop width for office/admin screens — per `PRODUCT.md`'s accessibility section.
6. **Verify visually, not just technically.** Run `npm run typecheck` and `npm run lint` to catch mechanical errors, then use the `run` skill (or `npx next dev`) to actually load the page and take a screenshot. Report what you saw, not just "the build passed" — the user cannot read a green checkmark and know the page looks right.
7. **Report in plain English.** Summarize what changed on the screen, why (tie back to the design system or the user's request), and attach or describe screenshots. Call out anything you deliberately left alone and why (e.g. "the dashboard's data logic didn't change, only the cards and table now use shadcn's Card and Table components").

Do not invent new brand colors, fonts, or design language — everything must derive from `DESIGN.md`. If a request conflicts with the design system's Don'ts, say so plainly and propose the closest on-brand alternative instead of silently complying.
