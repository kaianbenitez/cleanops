"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/auth/username";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginPage() {
  const router = useRouter();
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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--co-bg)] bg-[image:radial-gradient(circle_at_top,color-mix(in_srgb,var(--co-accent)_14%,transparent),transparent_52%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--co-evergreen)_8%,transparent),transparent_45%)] px-4 py-6 text-[var(--co-ink)] sm:px-6">
      <section className="w-full max-w-md rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-10 w-10"><path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill="var(--spark-mark)"/><path d="M32 12 L36 27 L51 32 L36 37 L32 52 L28 37 L13 32 L28 27 Z" fill="var(--spark-mark-facet)"/><path d="M49 8 L51.4 14.6 L58 17 L51.4 19.4 L49 26 L46.6 19.4 L40 17 L46.6 14.6 Z" fill="var(--spark-mark)"/></svg></span>
          <span className="text-lg font-semibold tracking-tight text-[var(--co-ink)]">ServiceSpark</span>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em] text-[var(--co-ink)]">Welcome back</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Username</span>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="co-input w-full bg-white py-3"
              placeholder="firstlast"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Password</span>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="co-input w-full bg-white py-3"
              placeholder="Your password"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
