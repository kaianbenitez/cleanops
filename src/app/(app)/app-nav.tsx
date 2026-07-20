"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  CalendarDays,
  ClipboardList,
  Users,
  FileText,
  Receipt,
  Wallet,
  UserCog,
  Boxes,
  Clock,
  RefreshCw,
  Settings,
  type LucideIcon,
} from "lucide-react";

const links = [
  ["/dashboard", "Dashboard"],
  ["/reports", "Reports"],
  ["/calendar", "Calendar"],
  ["/jobs", "Jobs"],
  ["/customers", "Customers"],
  ["/quotes", "Quotes"],
  ["/invoices", "Invoices"],
  ["/payroll", "Payroll"],
  ["/employees", "Employees"],
  ["/supplies", "Supplies"],
] as const;

const iconByHref: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/reports": LineChart,
  "/calendar": CalendarDays,
  "/jobs": ClipboardList,
  "/customers": Users,
  "/quotes": FileText,
  "/invoices": Receipt,
  "/payroll": Wallet,
  "/employees": UserCog,
  "/supplies": Boxes,
  "/my-day": Clock,
  "/sync-issues": RefreshCw,
  "/settings": Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavIcon({ href }: { href: string }) {
  const Icon = iconByHref[href] ?? LayoutDashboard;
  return <Icon aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />;
}

export default function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visibleLinks = isAdmin ? links : [["/my-day", "My day"] as const];

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-[#3a322b] bg-[#1c1917]/95 px-3 py-3 text-[#ece6de] backdrop-blur xl:hidden">
        <div className="flex items-center gap-3 overflow-x-auto">
          <Link href={isAdmin ? "/dashboard" : "/my-day"} className="flex shrink-0 items-center gap-2 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-[#c1592c] text-[11px] font-black tracking-tight text-white">CO</span>
            <span className="text-sm font-semibold">CleanOps</span>
          </Link>

          {visibleLinks.map(([href, label]) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-xs font-medium transition ${
                  active ? "border-white/10 bg-white/10 text-white" : "border-transparent bg-transparent text-[#b3a99c] hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon href={href} />
                {label}
              </Link>
            );
          })}

          {isAdmin ? (
            <>
              <Link
                href="/sync-issues"
                className={`flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-xs font-medium transition ${
                  pathname.startsWith("/sync-issues") ? "border-white/10 bg-white/10 text-white" : "border-transparent text-[#b3a99c] hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon href="/sync-issues" />
                Sync issues
              </Link>
              <Link
                href="/settings"
                className={`flex shrink-0 items-center gap-2 rounded-[14px] border px-3 py-2 text-xs font-medium transition ${
                  pathname.startsWith("/settings") ? "border-white/10 bg-white/10 text-white" : "border-transparent text-[#b3a99c] hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon href="/settings" />
                Settings
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/10 bg-[linear-gradient(180deg,#1c1917_0%,#151210_100%)] px-4 py-5 text-[#ece6de] xl:flex">
        <Link href={isAdmin ? "/dashboard" : "/my-day"} className="mb-8 flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/5 px-3 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#c1592c] text-sm font-black tracking-tight text-white">CO</span>
          <span>
            <span className="block text-[15px] font-semibold tracking-tight">CleanOps</span>
            <span className="block text-[11px] text-[#a89d8e]">operations desk</span>
          </span>
        </Link>

        <nav className="space-y-6">
          <div>
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a8074]">Workspace</p>
            <div className="space-y-1">
              {visibleLinks.map(([href, label]) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-[14px] px-3 py-[0.6875rem] text-[13px] transition ${
                      active
                        ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : "text-[#b3a99c] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active ? <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-[#c1592c]" /> : null}
                    <span className="ml-1">
                      <NavIcon href={href} />
                    </span>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {isAdmin ? (
          <div className="mt-auto space-y-3">
            <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a8074]">Control room</p>
              <p className="mt-2 text-sm font-semibold text-white">Fast access to syncs and system settings.</p>
              <p className="mt-1 text-xs leading-5 text-[#b3a99c]">Keep integrations visible so nothing drifts quietly in the background.</p>
            </div>

            <div className="space-y-1">
              <Link
                href="/sync-issues"
                className={`flex items-center gap-3 rounded-[14px] px-3 py-[0.6875rem] text-[13px] transition ${
                  pathname.startsWith("/sync-issues") ? "bg-white/10 text-white" : "text-[#b3a99c] hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon href="/sync-issues" />
                Sync issues
              </Link>
              <Link
                href="/settings"
                className={`flex items-center gap-3 rounded-[14px] px-3 py-[0.6875rem] text-[13px] transition ${
                  pathname.startsWith("/settings") ? "bg-white/10 text-white" : "text-[#b3a99c] hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon href="/settings" />
                Settings
              </Link>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
