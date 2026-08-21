import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./helpers/admin-session";

/**
 * §8.4/§10 browser coverage for the My Day matrix — every row here needs
 * `BROWSER_HYBRID_USERNAME`/`BROWSER_HYBRID_PASSWORD` set in `.env.local`
 * (see TESTING.md). Without them every test below `test.skip()`s and the
 * run still prints green — that is expected, not a bug; report skipped
 * separately from passed (TESTING.md, packet §8.4).
 *
 * Deliberately NOT `BROWSER_ADMIN_USERNAME`: this session verified directly
 * against the database that the account it currently points at
 * (`kaianbenitez`) has `isFieldStaff: false` — a genuinely office-only admin,
 * correctly bounced off `/my-day` to `/dashboard`. (The WP-F packet said that
 * account was a hybrid; it is not, as of this run — see the handoff's
 * credential note.) `BROWSER_HYBRID_USERNAME` (`brittneyriggs`) was verified
 * the same way: `role: "admin", isFieldStaff: true` — a real hybrid, so
 * `/my-day` actually loads for it.
 *
 * READ-ONLY BY DESIGN: `DATABASE_URL` in this environment resolves to the
 * *hosted* Supabase project (confirmed at WP-F step 0), so this spec runs
 * against real production data through a real account. Every test here only
 * navigates and asserts — none clicks a primary action, submits a form, or
 * otherwise mutates anything (TESTING.md, "Never do this"). Assertions that
 * would require actually driving a transition (does the aria-live region's
 * *text change* after a real state change; does the receipt stop counting
 * after a real clock-out) are `test.skip()`-ed with that reason — they need
 * `scripts/seed-field-test.ts` fixtures against a local Supabase instance,
 * which is not running in this session.
 *
 * Auth is generated ONCE (`beforeAll`), not per test: Supabase Auth
 * rate-limits magic-link generation for the same email in quick succession —
 * re-authenticating in every test's `beforeEach` hit that limit ("Email link
 * is invalid or has expired") partway through this file's first real run.
 * The cached session cookies are reused across every test instead.
 */

const username = process.env.BROWSER_HYBRID_USERNAME;
const password = process.env.BROWSER_HYBRID_PASSWORD;

const PRIMARY_ACTION_NAME = /^(Start travel to|I've arrived|Start cleaning|Wrap up|Back to My Day|Review today)/;

let cachedCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> = [];

test.describe("My Day — field validation (read-only)", () => {
  // Forces one worker for this file: `beforeAll` runs once per *worker*, not
  // once per file, so parallel workers would each fire their own magic-link
  // request and collide with Supabase Auth's per-email rate limit (this is
  // exactly what happened on the first attempt at this fix).
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!username || !password) return; // each test's own skip() reports this
    const context = await browser.newContext();
    await signInAsAdmin(context, baseURL!, username);
    cachedCookies = await context.cookies();
    await context.close();
  });

  test.beforeEach(async ({ page, context }) => {
    test.skip(!username || !password, "Set BROWSER_HYBRID_USERNAME and BROWSER_HYBRID_PASSWORD (see TESTING.md) — every test in this file skips without them.");
    await context.addCookies(cachedCookies);
    await page.goto("/my-day");
    await expect(page).toHaveURL(/\/my-day/);
  });

  test("320px: no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.reload();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: sub-pixel rounding
  });

  test("390px: no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("every visible button in the main content is at least 44×44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const buttons = page.locator("main button:visible");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue;
      expect.soft(box.width, `button ${i} width`).toBeGreaterThanOrEqual(44);
      expect.soft(box.height, `button ${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test("the primary action button is at least 56px tall, if one is offered", async ({ page }) => {
    const primary = page.getByRole("button", { name: PRIMARY_ACTION_NAME });
    if ((await primary.count()) === 0) {
      test.skip(true, "no primary action is offered in the account's current live state (e.g. day_complete with no stops)");
    }
    const box = await primary.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  });

  test("the work-state line is in an aria-live region, and the seconds counter is aria-hidden", async ({ page }) => {
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion.first()).toBeAttached();
    const liveText = (await liveRegion.first().textContent())?.trim() ?? "";
    expect(liveText.length).toBeGreaterThan(0);

    // The seconds counter — a monospace, tabular-nums elapsed-time span — must
    // never itself be inside an aria-live region and must be aria-hidden.
    const counter = page.locator('[aria-hidden] >> text=/^\\d+:\\d{2}(:\\d{2})?$/');
    const counterCount = await counter.count();
    if (counterCount === 0) {
      test.skip(true, "no recording counter is currently on screen (the account isn't mid-transition right now)");
    }
    await expect(counter.first()).toHaveAttribute("aria-hidden", "");
  });

  test("aria-live text actually changing after a real transition", async () => {
    test.skip(true, "requires driving a real state transition (a mutating click) — unsafe against the hosted database this session is connected to. Needs scripts/seed-field-test.ts fixtures against a local Supabase instance instead.");
  });

  test("keyboard: Tab reaches the primary action with a visible focus indicator", async ({ page }) => {
    const primary = page.getByRole("button", { name: PRIMARY_ACTION_NAME }).first();
    if ((await primary.count()) === 0) {
      test.skip(true, "no primary action is offered in the account's current live state");
    }
    await primary.focus();
    const isFocused = await primary.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
    const outline = await primary.evaluate((el) => {
      const style = getComputedStyle(el);
      return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
    });
    // Some visible focus indicator must be present — either a real outline or
    // a focus box-shadow ring (this codebase's usual pattern for co-* components).
    expect(outline.outlineStyle !== "none" || outline.boxShadow !== "none").toBe(true);
  });

  test("reduced motion: the recording indicator does not animate when prefers-reduced-motion is set", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    // The only animated element on this surface is the pulsing "recording"
    // dot (now-region.tsx, `motion-safe:animate-pulse`) — Tailwind's
    // `motion-safe:` variant is itself gated on `prefers-reduced-motion`, so
    // under "reduce" the animation utility should never apply. There is no
    // separate "receipt" animation anywhere in the My Day surface as of this
    // package (grepped for framer-motion/animate-*/transition- — none
    // found) — if the packet's "receipt transition" means something else,
    // flag it; this test covers the one real animated element that exists.
    const dot = page.locator("span.motion-safe\\:animate-pulse");
    if ((await dot.count()) === 0) {
      test.skip(true, "the account isn't currently recording, so the pulsing dot isn't rendered at all right now");
    }
    const animationName = await dot.first().evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
  });
});
