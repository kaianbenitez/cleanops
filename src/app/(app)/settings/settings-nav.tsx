"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Building2,
  Tags,
  Wallet,
  CalendarDays,
  Plug,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; icon: LucideIcon; links: NavLink[] };

const OVERVIEW: NavLink = { href: "/settings", label: "Overview" };

const GROUPS: NavGroup[] = [
  {
    label: "Company",
    icon: Building2,
    links: [
      { href: "/settings/company", label: "Profile & goals" },
      { href: "/settings/branding", label: "Branding" },
    ],
  },
  {
    label: "Pricing & quoting",
    icon: Tags,
    links: [
      { href: "/settings/pricing", label: "Pricing & travel zones" },
      { href: "/settings/room-types", label: "Room types" },
      { href: "/settings/services", label: "Service catalog" },
      { href: "/settings/quote-template", label: "Quote page content" },
    ],
  },
  {
    label: "Payroll",
    icon: Wallet,
    links: [
      { href: "/settings/payroll-tiers", label: "Commission tiers" },
      { href: "/settings/payroll-defaults", label: "Mileage rate" },
    ],
  },
  {
    label: "Calendar",
    icon: CalendarDays,
    links: [{ href: "/settings/calendar", label: "Holidays & working days" }],
  },
  {
    label: "Integrations",
    icon: Plug,
    links: [
      { href: "/settings/ghl", label: "GoHighLevel" },
      { href: "/settings/integrations", label: "Square & Google Maps" },
      { href: "/sync-issues", label: "Sync monitoring" },
    ],
  },
  {
    label: "Team & access",
    icon: UsersRound,
    links: [{ href: "/employees", label: "Employees & administrators" }],
  },
];

const ALL_LINKS: NavLink[] = [OVERVIEW, ...GROUPS.flatMap((group) => group.links)];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const current = ALL_LINKS.find((link) => isActive(pathname, link.href))?.href ?? OVERVIEW.href;

  return (
    <>
      <label className="block lg:hidden">
        <span className="sr-only">Jump to a settings section</span>
        <select
          value={current}
          onChange={(event) => router.push(event.target.value)}
          className="co-input w-full font-medium"
        >
          <option value={OVERVIEW.href}>{OVERVIEW.label}</option>
          {GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.links.map((link) => (
                <option key={link.href} value={link.href}>
                  {link.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <nav aria-label="Settings sections" className="hidden w-[220px] shrink-0 lg:block">
        <div className="sticky top-[80px] space-y-5">
          <Link
            href={OVERVIEW.href}
            aria-current={pathname === OVERVIEW.href ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-[14px] px-3 py-[0.6875rem] text-[13px] transition ${
              pathname === OVERVIEW.href
                ? "bg-[var(--co-accent-tint)] font-medium text-[var(--co-accent-text)]"
                : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            }`}
          >
            {pathname === OVERVIEW.href ? (
              <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-[var(--co-accent-fill)]" />
            ) : null}
            <LayoutGrid aria-hidden="true" strokeWidth={1.75} className="ml-1 h-[18px] w-[18px] shrink-0 opacity-90" />
            {OVERVIEW.label}
          </Link>

          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--co-faint)]">
                <group.icon aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
                {group.label}
              </p>
              <div className="space-y-1">
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-[14px] py-2.5 pl-6 pr-3 text-[13px] transition ${
                        active
                          ? "bg-[var(--co-accent-tint)] font-medium text-[var(--co-accent-text)]"
                          : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                      }`}
                    >
                      {active ? (
                        <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-[var(--co-accent-fill)]" />
                      ) : null}
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
