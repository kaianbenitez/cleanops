import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, MessageCircle, LogOut, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailToUsername } from "@/lib/auth/username";
import AppNav from "./app-nav";
import AppSurfaceMotion from "./app-surface-motion";
import CreateMenu from "./create-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(0,108,73,0.06),transparent_26%),radial-gradient(circle_at_top_right,rgba(0,108,73,0.04),transparent_18%),var(--co-bg)] text-[var(--co-ink)]">
      <AppNav isAdmin={isAdmin} userName={`${user.firstName} ${user.lastName}`} userEmail={emailToUsername(user.email)} />

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 hidden border-b border-[var(--co-line-soft)] bg-[var(--co-surface)]/90 backdrop-blur-xl xl:block">
          <div className="mx-auto flex h-[64px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10">
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--co-evergreen)]">{isAdmin ? "Operations Dashboard" : "Field view"}</p>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin ? (
                <form action="/customers" className="hidden min-w-0 sm:block">
                  <label className="relative block w-[min(34vw,360px)]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--co-faint)]" aria-hidden />
                    <input name="q" placeholder="Search customers, addresses, or tags..." className="co-input h-10 w-full rounded-lg bg-[var(--co-surface-muted)] pl-9 text-sm" />
                  </label>
                </form>
              ) : null}
              {isAdmin ? <CreateMenu /> : null}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Notifications"
                  title="Notifications"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                >
                  <Bell className="h-[18px] w-[18px]" aria-hidden />
                </button>
                <Link
                  href="/help-center"
                  aria-label="Support"
                  title="Support"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                >
                  <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
                </Link>
                <Link href="/account" className="hidden items-center gap-2 rounded-full py-1 pl-3 pr-1 transition hover:bg-[var(--co-surface-muted)] sm:flex">
                  <span className="text-right leading-tight">
                    <span className="block text-sm font-semibold text-[var(--co-ink)]">{user.firstName}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-faint)]">{user.role}</span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--co-accent-tint)] text-sm font-bold text-[var(--co-evergreen)]">
                    {user.firstName.slice(0, 1).toUpperCase()}
                  </span>
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                  >
                    <LogOut className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 xl:px-10 lg:py-8">
          <AppSurfaceMotion>{children}</AppSurfaceMotion>
        </main>
      </div>
    </div>
  );
}
