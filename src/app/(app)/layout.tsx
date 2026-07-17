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

  return <div className="min-h-[100dvh] bg-[#f5f6f2] text-[#1b2925]">
    <AppNav isAdmin={isAdmin} />
    <div className="lg:pl-64">
      <header className="flex h-[72px] items-center justify-between border-b border-[#e3e8e1] bg-[#f5f6f2]/95 px-5 backdrop-blur lg:px-10">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#80918a]">{isAdmin ? "Operations" : "Field view"}</p><p className="mt-0.5 text-sm font-medium text-[#34443e]">Keep the day moving</p></div>
        <div className="flex items-center gap-4"><span className="hidden text-right sm:block"><span className="block text-sm font-semibold">{user.firstName}</span><span className="block text-[11px] text-[#80918a]">{user.role}</span></span><form action="/api/auth/logout" method="post"><button type="submit" className="rounded-lg border border-[#d9e1da] bg-white px-3 py-2 text-xs font-medium text-[#52645c] transition hover:border-[#bdcbbf] hover:text-[#1b2925]">Sign out</button></form></div>
      </header>
      <main className="w-full px-4 py-6 sm:px-6 lg:px-7 xl:px-8 2xl:px-10 lg:py-8">
        <AppSurfaceMotion>{children}</AppSurfaceMotion>
      </main>
    </div>
  </div>;
}
