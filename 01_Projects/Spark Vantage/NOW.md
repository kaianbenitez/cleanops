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

**`sparkvantage.co` — bought 2026-09-09 at Namecheap.** Note the `.co`, not
the `.io` originally shortlisted. Both `sparkvantage.co` and
`www.sparkvantage.co` are already attached to the Vercel project
`kaiann/spark-vantage`.

**DNS is not pointed yet.** As of 2026-09-09 the nameservers are still
Namecheap's defaults (`dns1/dns2.registrar-servers.com`) and the domain
resolves to Namecheap's parking page.

**Route it through Cloudflare, not Vercel DNS.** Cloudflare Email Routing —
the free way to get `kaian@sparkvantage.co` forwarding to Gmail — only works
when Cloudflare runs the domain's DNS. Vercel DNS has no free email
forwarding, so using it would cost the branded email plan.

Steps (all need Kaian's own logins):
1. Add `sparkvantage.co` to a free Cloudflare account; Cloudflare gives two
   nameservers.
2. In Namecheap → Domain List → Manage → Nameservers, switch to "Custom DNS"
   and paste Cloudflare's two. Propagation is usually under an hour.
3. In Cloudflare DNS add:
   - `A` · name `@` · value `76.76.21.21` · **proxy OFF (grey cloud)**
   - `CNAME` · name `www` · value `cname.vercel-dns.com` · **proxy OFF**
   The grey cloud matters — leaving Cloudflare's orange proxy on breaks
   Vercel's SSL issuance.
4. Cloudflare → Email → Email Routing: forward `kaian@sparkvantage.co` to the
   real Gmail, then add a Gmail "Send As" alias so replies come from it.
5. Get a free Web3Forms access key at web3forms.com using that address and
   paste it into `site/index.html`'s `access_key` hidden input (currently a
   PLACEHOLDER — the contact form does not deliver anywhere until this is
   done).
6. Fill in the real email/phone in the footer, which are still marked
   PLACEHOLDER.

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

**Mascot artwork is final**, done 2026-09-09 by Kaian via ChatGPT — the
hand-coded SVG placeholder is gone. Two poses in `site/assets/`:
`mascot-hero.png` (arms crossed, confident — used in the hero) and
`mascot-wave.png` (waving — used in the closing CTA card). Both were split
out of one source image ChatGPT generated with both poses side by side.

The five feature rows use hand-coded SVG mockups in `site/assets/feat-*.svg`
standing in for real GHL product screenshots, which don't exist yet.

**Copy overhauled 2026-09-11.** The build originally carried the GHL-template
voice it was cloned from — winking asides ("we're fired and extremely
embarrassed", "beauty sleep", "the proof is in the pudding"), Title Case
headings, and four feature bullets that repeated their own intro line
verbatim. All of it is gone. The voice now is short sentences, sentence case,
concrete nouns, no jokes and no over-explaining. Three substantive changes
beyond tone, each a judgement call worth knowing about:

1. **The hero star ratings were removed.** The strip used Google, Facebook and
   Trustpilot logos with five filled stars each, against ratings that don't
   exist on any of those platforms. It's now three plain facts: "Live in 7–10
   days", "One builder, start to finish", "You see it before you pay".
2. **"5-Star Reviews Only / five stars, every time" is gone.** Steering only
   happy customers to Google is review gating and breaks Google's policy. The
   section now sells timing (asked the same day) and private routing for
   unhappy customers, which is the defensible version of the same feature.
3. **"87% of people visit websites on their phone" is gone** — an unsourced
   number. Replaced with a qualitative line.

Two claims on the page need Kaian's sign-off because they are business
decisions, not copy: **"You see it before you pay"** in the hero (the free
sample offer — pull it if it isn't offered to everyone) and **"Live in 7–10
days"**, which now appears in the hero as a promise rather than only in the
process steps. US spelling throughout ("inquiry", not "enquiry").

Real content used:
- **One real testimonial** from Nemo (owner, Mr. Pink's Cleaning Service) —
  his exact words, no edits. A video testimonial from him is expected later;
  add it to the Reviews section when it arrives. The on-page note announcing
  that it was coming was removed 2026-09-11 (advertising a missing testimonial
  reads as an apology) — there's an HTML comment marking the slot instead.
- **No portfolio/"Our Work" section.** Removed 2026-09-09 — it showed real
  screenshots + live links to Mr. Pink's Cleaning Service and JL Construction
  (the latter a free sample, lead not closed). Instead, "Mr. Pink's Cleaning
  Service" in the testimonial byline is now a live hyperlink to
  mrpinkscleaningservice.com, so the one proof point lives inside the
  testimonial itself.
- Services: Website Design (free sample first), then the GHL system at
  $97/month flat, with Local SEO + GBP optimization as an add-on — $100
  one-time setup, waived if the client commits to quarterly billing
  (3 × $97 paid upfront). Corrected 2026-09-10; supersedes the earlier
  "$75/mo flat" note. **No price is shown on the live site** — the Local SEO
  section's 4th bullet was changed from a price line to "Google Business
  Profile Included" on 2026-09-10.

**Footer email filled in 2026-09-10:** `kaian@sparkvantage.co`, as a `mailto:` link.
This only actually delivers mail if the Cloudflare Email Routing forward (step 4
above) has been set up — confirm that before relying on it for real leads.

**Still placeholder, by Kaian's choice:** contact phone in the footer (he may
get a second number later so his current one isn't at risk of a spam flag), the
Web3Forms `access_key`, and the "what happens if I cancel" FAQ answer (blocked
on a settled contract/pricing policy). These are marked in-page with the `.tbd`
class so they're easy to find — search `index.html` for `PLACEHOLDER`.

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
