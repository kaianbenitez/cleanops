"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth/username";
import { loginReasonMessage } from "@/lib/supabase/login-reason";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const DEFAULT_REASON_MESSAGE = loginReasonMessage(null);

export default function LoginPage() {
  // `reason` only resolves via useSearchParams, which forces this subtree to
  // client-render past the Suspense boundary — see the WP-E note on
  // ReasonAwareLoginForm below. Falling back to the same generic copy the
  // hook would resolve to for a missing/unknown reason keeps the initial
  // HTML and the hydrated result visually identical (no flash of new text).
  return (
    <Suspense fallback={<LoginForm reasonMessage={DEFAULT_REASON_MESSAGE} />}>
      <ReasonAwareLoginForm />
    </Suspense>
  );
}

/** Split out only so `useSearchParams` (a Client Component hook that forces
 * CSR past its own Suspense boundary — see node_modules/next/dist/docs/…
 * /use-search-params.md) doesn't force the whole login page to skip
 * prerendering. */
function ReasonAwareLoginForm() {
  const searchParams = useSearchParams();
  return <LoginForm reasonMessage={loginReasonMessage(searchParams.get("reason"))} />;
}

function LoginForm({ reasonMessage }: { reasonMessage: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const email = usernameToEmail(username.trim().toLowerCase());
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      // Turnstile tokens are single-use — clear it and force a fresh challenge
      // before the next attempt.
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      return;
    }

    // Let "/" resolve the destination (root-redirect.ts's already-tested
    // resolveLandingSurface) instead of hardcoding /dashboard and relying on
    // that page to bounce field employees to /my-day — sends them there
    // directly (WP-E §8.2).
    //
    // A hard navigation, not router.push(): "/" is deliberately built as a
    // static page (src/app/page.tsx) so anonymous/crawler traffic never pays
    // for a dynamic render, which means Next's client Router Cache treats it
    // as a "static" segment cached for 5 minutes by default (staleTimes.md).
    // router.push("/") after sign-in could serve that stale, signed-out
    // marketing-page render straight from the client cache — skipping the
    // server round trip entirely, so middleware's resolveRootRequest never
    // runs and a freshly-authenticated user lands back on the landing page.
    // window.location.href always issues a real HTTP request.
    window.location.href = "/";
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--co-bg)] bg-[image:radial-gradient(circle_at_top,color-mix(in_srgb,var(--co-accent)_14%,transparent),transparent_52%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--co-accent-fill)_8%,transparent),transparent_45%)] px-4 py-6 text-[var(--co-ink)] sm:px-6">
      <section className="w-full max-w-md rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-6 shadow-sm sm:p-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--co-muted)] hover:text-[var(--co-ink)]">
          ← Back to Shimmer
        </Link>

        <div className="flex items-center gap-3">
          <img src="/brand/logo-mark.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
          <span className="text-lg font-semibold tracking-tight text-[var(--co-ink)]">Shimmer</span>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em] text-[var(--co-ink)]">Welcome back</h1>

        <p role="status" className="mt-2 text-sm text-[var(--co-muted)]">
          {reasonMessage}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Username</span>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="co-input w-full py-3"
              placeholder="firstlast"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="co-input w-full py-3"
              placeholder="Your password"
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--co-muted)]">
              Open Shimmer from the same Home Screen icon or Safari tab each day.
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--co-muted)]">
              Only use this on a phone that&apos;s yours. On a shared phone, sign out when you&apos;re done so nobody else can open your day.
            </span>
          </label>

          {error ? (
            <p role="alert" className="co-badge-danger rounded-xl px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          {TURNSTILE_SITE_KEY ? (
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
              options={{ size: "flexible" }}
            />
          ) : null}

          <button type="submit" disabled={loading} className="co-button-primary w-full justify-center py-3">
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>
      </section>
    </main>
  );
}
