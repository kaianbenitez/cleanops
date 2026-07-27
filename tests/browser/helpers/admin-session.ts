import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../../../src/lib/auth/username";

/**
 * Authenticates a Playwright browser context as the given admin without going
 * through the login form. Password sign-in requires a solved Turnstile
 * challenge (CAPTCHA protection enabled 2026-07-28), which headless Chromium
 * cannot solve — Cloudflare correctly blocks it, same as it would a real bot.
 * This mints a one-time magic-link token via the service-role admin API and
 * redeems it directly, the same bypass used by scripts/smoke-test.mjs.
 * Neither endpoint is CAPTCHA-gated (only sign-in/sign-up/password-reset are).
 */
export async function signInAsAdmin(context: BrowserContext, baseURL: string, username: string) {
  const email = usernameToEmail(username.trim().toLowerCase());
  const cookies = new Map<string, string>();

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...cookies.entries()].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw new Error(`Could not generate a login link for ${email}: ${linkError.message}`);

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw new Error(`Could not redeem the login link for ${email}: ${verifyError.message}`);

  await context.addCookies(
    [...cookies.entries()].map(([name, value]) => ({ name, value, url: baseURL })),
  );
}
