"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--co-accent)]">{value}</p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(200,232,107,0.11),transparent_20%),radial-gradient(circle_at_bottom_right,rgba(20,33,31,0.08),transparent_24%),var(--co-bg)] px-4 py-6 text-[var(--co-ink)] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1600px] gap-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden overflow-hidden rounded-[32px] border border-white/60 bg-[linear-gradient(180deg,#14211f_0%,#101a18_100%)] p-10 text-white shadow-[0_24px_80px_rgba(20,33,31,.18)] lg:flex lg:flex-col lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--co-accent)] text-sm font-black text-[var(--co-evergreen)]">CO</span>
              <span className="text-xl font-semibold tracking-tight">CleanOps</span>
            </div>

            <p className="mt-20 text-6xl font-semibold leading-[0.95] tracking-[-0.07em] text-balance">
              The calm center of your cleaning operation.
            </p>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/70">
              Keep quoting, scheduling, payroll, and customer details in one working surface your team can actually trust.
            </p>
          </div>

          <div className="grid max-w-xl grid-cols-3 gap-3">
            <Metric label="Schedule" value="Clear" />
            <Metric label="Payments" value="Tracked" />
            <Metric label="Payroll" value="Ready" />
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-xl items-center">
          <div className="w-full rounded-[32px] border border-[var(--co-line)] bg-white/92 p-6 shadow-[0_18px_60px_rgba(20,33,31,.08)] backdrop-blur sm:p-8">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--co-evergreen)] text-sm font-black text-[var(--co-accent)]">CO</span>
              <span>
                <span className="block text-lg font-semibold text-[var(--co-ink)]">CleanOps</span>
                <span className="block text-xs text-[var(--co-muted)]">operations desk</span>
              </span>
            </div>

            <p className="eyebrow">Operations desk</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[var(--co-ink)]">Welcome back.</h1>
            <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[var(--co-muted)]">
              Sign in to manage today&apos;s schedule, customers, jobs, invoices, and payroll.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block text-sm">
                <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">Email address</span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="co-input w-full bg-white py-3"
                  placeholder="you@company.com"
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

              <button type="submit" disabled={loading} className="co-button-primary w-full justify-center py-3">
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--co-muted)]">Internal use</p>
                <p className="mt-2 text-sm text-[var(--co-ink)]">This workspace is for the operations team only.</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/45 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--co-muted)]">Customer quotes</p>
                <p className="mt-2 text-sm text-[var(--co-ink)]">Proposal links stay separate and secure.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
