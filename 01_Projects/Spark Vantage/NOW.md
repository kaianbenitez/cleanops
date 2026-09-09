---
updated: 2026-09-09
purpose: Spark Vantage — Kaian's own agency brand for the web design / SEO+GBP outreach business
---

# Spark Vantage — read this first

Spark Vantage is Kaian's own agency brand (not a lead/client) — the umbrella
name for the web design + SEO/GBP outreach work tracked in
`01_Projects/US Cleaning Website Outreach/`. Named after his bunny Spark
(see vault memory `project_servicespark_name_collision`) in the same family
as Shimmer, his other product.

## Domain

**`sparkvantage.io` is picked but not yet purchased.** Confirmed available
via WHOIS + DNS check 2026-09-09. Not registered by Claude — buying a
domain is a real purchase, left to Kaian to do himself (Porkbun tends to be
cheapest for `.io`).

Once purchased:
1. Set up free branded email via Cloudflare Email Routing (forward
   `kaian@sparkvantage.io` → real Gmail), plus a Gmail "Send As" alias.
2. Get a free Web3Forms access key at web3forms.com using that email, paste
   it into `site/index.html`'s `access_key` hidden input (currently a
   PLACEHOLDER — the quote form does not deliver anywhere yet).
3. Point the domain at the Vercel deployment below.

## Site

**Rebuilt 2026-09-09** from scratch on the **stonesystems.io** visual
direction — the earlier homepage-template build was discarded because it
looked nothing like the reference. Files in `site/`. **Live at
https://spark-vantage.vercel.app** (Vercel project `kaiann/spark-vantage`).
The full build spec is in `SITE-SPEC.md` next to this file.

**Palette changed from spark-orange to red** (Kaian's pick, 2026-09-09):
navy `#1B1F30` base, red `#E0261B` for buttons and fills, coral `#FF6F5E`
for small accent text on navy. Never use `#E0261B` for text on navy — the
contrast is too low; that's what the coral is for. Type is **Sora** (900 for
display), matching the reference.

**Mascot is a placeholder.** `site/assets/mascot-hero.svg` is a hand-coded
flat bunny ("Spark", with a headset — deliberately not a hard hat) used as a
stand-in so the hero isn't empty. Kaian is producing the real artwork with
ChatGPT. To swap it: replace that file, or point the two `<img>` tags in
`index.html` (hero + closing CTA) at the new file. Sized for ~400x580.

The five feature rows use hand-coded SVG mockups in `site/assets/feat-*.svg`
standing in for real GHL product screenshots, which don't exist yet.

Real content used:
- **One real testimonial** from Nemo (owner, Mr. Pink's Cleaning Service) —
  his exact words, no edits. A video testimonial from him is expected later;
  add it to the Reviews section when it arrives (currently a text-only note
  on the page says it's coming).
- **Portfolio section** shows real screenshots + live links to Mr. Pink's
  Cleaning Service (delivered client, tagged "Client Project — Live") and
  JL Construction (tagged "Free Sample" — that lead hasn't closed yet, so
  it's deliberately not presented as a client).
- Services: Website Design (free sample first) and SEO + GBP Optimization
  ($75/mo, the real price already quoted to Nemo).

**Still placeholder, by Kaian's choice (2026-09-09):** contact email/phone
in the footer, the Web3Forms `access_key`, and the "what happens if I cancel"
FAQ answer (blocked on a settled contract/pricing policy). All three are
marked in-page with the `.tbd` class so they're easy to find — search
`index.html` for `PLACEHOLDER`.

**"Book A Call" has no booking link yet.** Every CTA anchors to the on-page
`#contact` form. Swap those `href="#contact"` values for a real Calendly/GHL
booking URL once one exists.

## Naming shortlist (in case sparkvantage.io ever needs a backup)

Confirmed available as of 2026-09-09 (re-check before relying on this —
domain availability changes): `sparkfunnel.io`, `sparkrank.io`,
`sparkgrow.io`, `sparkdirect.io`, `sparkprime.io`, `sparkcraft.io`,
`sparkbuzz.io`, `sparkpress.io`, `sparkpeak.io`. Full naming taste rules
(no Tagalog phonetics, avoid trade-metaphor suffixes, etc.) are in the
vault memory `project_servicespark_name_collision`.

Related: [[../US Cleaning Website Outreach/NOW - Read Me First]]
