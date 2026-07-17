"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

type NavIconName = "dashboard" | "reports" | "calendar" | "jobs" | "customers" | "quotes" | "invoices" | "payroll" | "employees" | "supplies" | "clock" | "sync" | "settings";
const iconByHref: Record<string, NavIconName> = {
  "/dashboard": "dashboard", "/reports": "reports", "/calendar": "calendar", "/jobs": "jobs", "/customers": "customers", "/quotes": "quotes", "/invoices": "invoices", "/payroll": "payroll", "/employees": "employees", "/supplies": "supplies", "/my-day": "clock", "/sync-issues": "sync", "/settings": "settings",
};

export default function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visibleLinks = isAdmin ? links : [["/my-day", "My day"] as const];

  return (
    <>
    <div className="sticky top-0 z-30 flex w-full items-center gap-3 overflow-x-auto border-b border-[#2a3d38] bg-[#14211f] px-4 py-3 text-[#e8eee9] lg:hidden">
      <Link href={isAdmin ? "/dashboard" : "/my-day"} className="mr-2 flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#c8e86b] text-[11px] font-black tracking-tight text-[#14211f]">CO</span>
        <span className="text-sm font-semibold">CleanOps</span>
      </Link>
      {visibleLinks.map(([href, label]) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${active ? "bg-[#2a3d38] text-white" : "text-[#aab9b2]"}`}><NavIcon name={iconByHref[href]} />{label}</Link>; })}
      {isAdmin && <><Link href="/sync-issues" className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${pathname.startsWith("/sync-issues") ? "bg-[#2a3d38] text-white" : "text-[#aab9b2]"}`}><NavIcon name="sync" />Sync issues</Link><Link href="/settings" className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${pathname.startsWith("/settings") ? "bg-[#2a3d38] text-white" : "text-[#aab9b2]"}`}><NavIcon name="settings" />Settings</Link></>}
    </div>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#14211f] px-4 py-5 text-[#e8eee9] lg:flex">
      <Link href={isAdmin ? "/dashboard" : "/my-day"} className="mb-9 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#c8e86b] text-sm font-black tracking-tight text-[#14211f]">CO</span>
        <span><span className="block text-[15px] font-semibold tracking-tight">CleanOps</span><span className="block text-[11px] text-[#9eafa8]">operations desk</span></span>
      </Link>

      <nav className="space-y-1">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#748880]">Workspace</p>
        {visibleLinks.map(([href, label]) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return <Link key={href} href={href} className={`group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition ${active ? "bg-[#2a3d38] text-white" : "text-[#aab9b2] hover:bg-[#1e302c] hover:text-white"}`}>
            <NavIcon name={iconByHref[href]} />
            {label}
          </Link>;
        })}
      </nav>

      {isAdmin && <div className="mt-auto space-y-1">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#748880]">Control room</p>
        <Link href="/sync-issues" className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition ${pathname.startsWith("/sync-issues") ? "bg-[#2a3d38] text-white" : "text-[#aab9b2] hover:bg-[#1e302c] hover:text-white"}`}><NavIcon name="sync" />Sync issues</Link>
        <Link href="/settings" className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition ${pathname.startsWith("/settings") ? "bg-[#2a3d38] text-white" : "text-[#aab9b2] hover:bg-[#1e302c] hover:text-white"}`}><NavIcon name="settings" />Settings</Link>
      </div>}
    </aside>
    </>
  );
}

function NavIcon({ name }: { name: NavIconName | undefined }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<NavIconName, React.ReactNode> = {
    dashboard: <><rect {...common} x="3" y="3" width="7" height="7" rx="1" /><rect {...common} x="14" y="3" width="7" height="7" rx="1" /><rect {...common} x="3" y="14" width="7" height="7" rx="1" /><rect {...common} x="14" y="14" width="7" height="7" rx="1" /></>,
    reports: <><path {...common} d="M4 19V5M4 19h16" /><path {...common} d="M7.5 15.5 11 11l3 3 4.5-6" /><circle {...common} cx="11" cy="11" r="0.8" /></>,
    calendar: <><rect {...common} x="3" y="4.5" width="18" height="16" rx="2" /><path {...common} d="M7 2.8v3.5M17 2.8v3.5M3 9h18" /></>,
    jobs: <><rect {...common} x="3" y="6.5" width="18" height="14" rx="2" /><path {...common} d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3 12h18" /></>,
    customers: <><circle {...common} cx="9" cy="8" r="3" /><path {...common} d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M16 14a5 5 0 0 1 4.5 6" /></>,
    quotes: <><path {...common} d="M6 3h9l4 4v14H6z" /><path {...common} d="M15 3v5h5M9 12h6M9 16h6" /></>,
    invoices: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M14.5 8.5c-.6-.6-1.4-.9-2.5-.9-1.3 0-2.2.7-2.2 1.7 0 2.8 4.9 1.1 4.9 4 0 1.1-.9 2-2.6 2-1.1 0-2-.3-2.7-1M12 6.5v11" /></>,
    payroll: <><rect {...common} x="3" y="5" width="18" height="14" rx="2" /><path {...common} d="M3 9h18M7 14h3" /></>,
    employees: <><circle {...common} cx="9" cy="8" r="3" /><circle {...common} cx="17" cy="9" r="2.3" /><path {...common} d="M3.5 20a5.5 5.5 0 0 1 11 0M15 14.5a4.5 4.5 0 0 1 5 5.5" /></>,
    supplies: <><path {...common} d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path {...common} d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
    clock: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M12 7v5l3 2" /></>,
    sync: <><path {...common} d="M4 7h12l-2.5-2.5M20 17H8l2.5 2.5M16 7l2-2M8 17l-2 2" /></>,
    settings: <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4V19a2 2 0 0 1-4 0v-.1A2 2 0 0 0 5.8 17l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1A2 2 0 0 0 1.6 10.8H1.5a2 2 0 0 1 0-4h.1A2 2 0 0 0 3 3.4l-.1-.1A2 2 0 0 1 5.7.5l.1.1A2 2 0 0 0 9.2 0V.1a2 2 0 0 1 4 0v.1a2 2 0 0 0 3.4.5l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a2 2 0 0 0 1.4 3.4h.1a2 2 0 0 1 0 4h-.1a2 2 0 0 0-1.4 3.4Z" transform="translate(2.5 2.5) scale(.79)" /></>,
  };
  return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0 opacity-90" viewBox="0 0 24 24">{paths[name ?? "dashboard"]}</svg>;
}
