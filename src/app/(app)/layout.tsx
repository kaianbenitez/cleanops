import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import AppNav from "./app-nav";
import AppSurfaceMotion from "./app-surface-motion";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(200,232,107,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(20,33,31,0.05),transparent_18%),var(--co-bg)] text-[var(--co-ink)]">
      <AppNav isAdmin={isAdmin} />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-[rgba(245,246,242,0.84)]/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10">
            <div className="min-w-0">
              <p className="eyebrow">{isAdmin ? "Operations desk" : "Field view"}</p>
              <p className="mt-1 text-sm font-medium text-[#34443e]">Keep the day moving</p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/account"
                className="hidden rounded-[14px] border border-[#dfe5dc] bg-white/80 px-3 py-2 text-right shadow-[0_1px_0_rgba(255,255,255,0.75)_inset] transition hover:border-[#bdcbbf] sm:block"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#80918a]">Signed in as</p>
                <p className="mt-0.5 text-sm font-semibold text-[#1b2925]">{user.firstName}</p>
                <p className="text-[11px] text-[#80918a]">{user.role}</p>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-xl border border-[#d9e1da] bg-white px-4 py-2.5 text-xs font-semibold text-[#52645c] transition hover:border-[#bdcbbf] hover:text-[#1b2925]"
                >
                  Sign out
                </button>
              </form>
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
