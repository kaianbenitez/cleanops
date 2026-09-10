---
updated: 2026-09-09
purpose: Build spec for the Spark Vantage landing page rebuild (Stone Systems visual direction)
---

# Spark Vantage site — build spec

Approved by Kaian 2026-09-09. Replaces the generic homepage template that was in
`site/`. The visual reference is **https://stonesystems.io/** — structure, rhythm and
section treatment are copied deliberately; brand colors and the mascot are ours.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#1B1F30` | hero, trades, footer, dark cards |
| `--navy-deep` | `#141826` | footer base, deepest panels |
| `--navy-card` | `#232840` | "why different" cards on white |
| `--red` | `#E0261B` | buttons, active FAQ pill, accent rules |
| `--red-dark` | `#B81D14` | button hover |
| `--coral` | `#FF6F5E` | accent **text** on navy (checkmarks, eyebrow labels) |
| `--grey-bg` | `#F1F1F1` | alternating light sections |
| `--ink` | `#1B1F30` | headings on light |
| `--ink-soft` | `#4A4F5E` | body copy |
| `--muted` | `#8A90A0` | captions, footer secondary |

**Why two reds:** solid `--red` behind white text has strong contrast, but red *text*
on navy does not. Small accent text on dark sections uses `--coral` instead. Never use
`--red` for text on `--navy`.

**Type:** Sora throughout (Google Fonts, weights 400/600/700/800/900), matching the
reference. Display headings are weight 900 with tight tracking; body is 400/600.

**Section rhythm:** white → grey → navy, with angled chevron `clip-path` dividers
entering and leaving the navy bands, exactly as the reference does.

## Page structure

1. **Sticky header** — wordmark + bunny glyph, nav (Services, Work, Reviews, Process,
   FAQ), red "Book A Call" button.
2. **Hero** (navy) — red vertical rule beside a 900-weight three-line headline
   *"Website Design & Marketing Systems For Contractors"*, subcopy, trust badges,
   red CTA, mascot right.
3. **Proof** (grey) — *"The proof is in the pudding… Let's see what our clients have to
   say"*. One featured full-width card: Nemo, Mr. Pink's Cleaning Service. Video-coming
   note retained.
4. **Recent builds** (white) — the two real portfolio screenshots. Mr. Pink's tagged
   *Client Project — Live*; JL Construction tagged *Free Sample* (that lead has not
   closed — must not be presented as a client).
5. **Features intro** — *"Simple systems that actually work"* /
   *"No jargon, no degrees — just systems that book jobs."*
6–10. **Five alternating feature rows**, each: hand-built SVG mockup, heading, italic
   subline, coral checkmark bullets, CTA button.
   - Functional Website
   - 5-Star Magic Review Funnel
   - Missed Call Text Back
   - One-Click Marketing Campaigns
   - Local SEO
11. **Trades** (navy, chevron top) — *"Serving all these trades and more…"*, icon cards.
12. **Process** (grey) — three steps: Book A Call (~15 min) → We Build Your System →
    Launch Call.
13. **Why we're different** (white) — *"Why we're 'totally unique'… just like everyone
    else, right?"* — six navy cards.
14. **FAQ** (grey) — accordion, active item is a solid red pill with white text.
15. **CTA** — navy rounded card, waving mascot, red button.
16. **Footer** (navy deep).

## Mascot

Hand-coded flat SVG. **Spark**, a bunny (the brand is named after Kaian's bunny), with a
headset — deliberately *not* a hard hat, so it reads marketing agency rather than
contractor. Flat geometric shapes, bold shapes over shading, limited palette (cream fur,
red vest, navy details, coral inner ear). Two files:

- `assets/mascot-hero.svg` — arms crossed, confident, front-facing.
- `assets/mascot-wave.svg` — waving, used in the closing CTA card.

## Feature mockups

Five hand-coded SVGs standing in for product screenshots that do not exist yet (no GHL
account). They depict plausible UI, drawn on-brand: laptop with a site and an incoming
text, a 5-star review card, a missed-call auto-reply thread, a campaign dashboard, and a
Google result with a map pin. Vector, no external assets, no cost.

## Content rules

- **Nemo's testimonial is verbatim.** Do not edit, shorten or embellish it.
- **JL Construction is not a client.** Keep the "Free Sample" tag.
- **$75/mo** is the real SEO + GBP price already quoted; keep it accurate.
- The four GHL-dependent features (review funnel, missed-call text-back, campaigns, and
  the automation half of the website feature) describe capability Kaian will deliver via
  GHL. Approved to present now.
- Existing placeholders stay explicitly marked: contact email/phone, Kaian's photo,
  Web3Forms `access_key`.

## CTA behaviour

No Calendly or GHL booking link exists yet. Every "Book A Call" button anchors to the
on-page quote form (`#contact`). Swap for a real booking URL once GHL is live.

## Files

All under `01_Projects/Spark Vantage/site/`:

- `index.html` — full rewrite
- `styles.css` — full rewrite
- `script.js` — accordion, scroll-reveal, mobile nav
- `assets/mascot-hero.svg`, `assets/mascot-wave.svg` — new
- `assets/feat-*.svg` — five new feature mockups
- `../NOW.md` — palette line updated from spark-orange to red

Existing `assets/work-mrpinks.jpg` and `assets/work-jlconstruction.jpg` are reused
unchanged.

## Hero metrics measured from stonesystems.io (2026-09-10)

Read off the live Stone Systems DOM at a 2504px viewport, so these are exact, not
eyeballed. Spark's hero now matches them. Re-measure before assuming they still hold.

| Thing | Stone value |
| --- | --- |
| Container | `max-width: 1320px`, 16px side padding |
| Hero band padding | `120px 0` (drops to `40px` under 62em) |
| H1 | `4.8rem` (76.8px) **flat**, `line-height: 1.2`, `letter-spacing: normal`, weight 900 |
| Gap under H1 block | `50px` |
| Lede | `20px / 31px`, `max-width: 590px` |
| Gap above trust row | `75px` |
| Trust label | `16px / 24.8px`, weight 600 |
| Trust stars | `22px` |
| Hero CTA button | `20px` text, `60px` tall, `0 32px` padding |
| Nav button | `17px` text, `60px` tall |
| Mascot column | `350px` wide, **allowed to overflow** the padding box |

Two things that make or break the match:

1. **The H1 is a flat 4.8rem, not fluid.** A `clamp()` that caps below 76.8px will never
   look right no matter how the rest is tuned. Spark uses `clamp(2.75rem, 5.82vw, 4.8rem)`
   — 5.82vw hits exactly 76.8px at a 1320px viewport, so every desktop gets Stone's flat
   size while narrower screens scale instead of overflowing.
2. **The text column sets the hero height, not the art.** Stone's mascot is only 350px wide
   and overflows the 120px padding box. Spark's rabbit was 440px wide inside a centred
   grid, so the *art* drove the height and the band never matched. Keeping the art column
   at 350px is what makes the hero land at ~890px like Stone's.

At 1320px the title needs ~795px of width ("Marketing Systems" alone is 769px), which is
why the container had to go 1160 → 1320. Anything narrower forces a wrap.
