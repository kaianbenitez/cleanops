"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  LineChart,
  Star,
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
  Inbox,
  Settings,
  HelpCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  CircleUserRound,
  ChevronDown,
  LogOut,
  CalendarCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import GlobalSearch from "./global-search";
import NotificationsMenu, { type Notification } from "./notifications-menu";
import CreateMenu from "./create-menu";
import ThemeToggle, { ThemeToggleMenuItem } from "./theme-toggle";
import SurfaceSwitcher from "./surface-switcher";

const links = [
  ["/dashboard", "Dashboard"],
  ["/reports", "Reports"],
  ["/quality", "Quality"],
  ["/calendar", "Calendar"],
  ["/jobs", "Jobs"],
  ["/customers", "Customers"],
  ["/quotes", "Quotes"],
  ["/invoices", "Invoices"],
  ["/payroll", "Payroll"],
  ["/employees", "Employees"],
] as const;

const fieldLinks = [
  ["/my-day", "My day"],
  ["/schedule", "Schedule"],
  ["/scores", "My scores"],
] as const;

const iconByHref: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/reports": LineChart,
  "/quality": Star,
  "/calendar": CalendarDays,
  "/jobs": ClipboardList,
  "/customers": Users,
  "/quotes": FileText,
  "/invoices": Receipt,
  "/payroll": Wallet,
  "/employees": UserCog,
  "/supplies": Boxes,
  "/my-day": Clock,
  "/schedule": CalendarDays,
  "/scores": Star,
  "/sync-issues": RefreshCw,
  "/leads": Inbox,
  "/settings": Settings,
  "/help-center": HelpCircle,
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavIcon({ href }: { href: string }) {
  const Icon = iconByHref[href] ?? LayoutDashboard;
  return <Icon aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />;
}

function SidebarLinks({ items, pathname, navCollapsed }: { items: readonly (readonly [string, string])[]; pathname: string; navCollapsed: boolean }) {
  return (
    <div className="space-y-1">
      {items.map(([href, label]) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={navCollapsed ? label : undefined}
            title={navCollapsed ? label : undefined}
            className={`group relative flex items-center rounded-[14px] py-[0.6875rem] text-[13px] transition ${navCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${
              active
                ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)] font-medium"
                : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
            }`}
          >
            {active ? <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-[var(--co-accent-fill)]" /> : null}
            <span className={navCollapsed ? "" : "ml-1"}>
              <NavIcon href={href} />
            </span>
            {navCollapsed ? null : <span>{label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

function ProfileAvatar({ profilePhotoUrl, userName, size = "h-10 w-10" }: { profilePhotoUrl: string | null; userName: string; size?: string }) {
  const initial = userName.trim().charAt(0).toUpperCase();
  if (profilePhotoUrl) {
    return (
      <span className={`relative ${size} shrink-0 overflow-hidden rounded-full`}>
        <Image src={profilePhotoUrl} alt="" aria-hidden="true" fill sizes="40px" className="object-cover" />
      </span>
    );
  }
  return <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-[var(--co-accent-tint)] text-sm font-bold text-[var(--co-accent-text)]`}>{initial}</span>;
}

export default function AppNav({
  isAdmin,
  isFieldStaff,
  userName,
  userEmail,
  profilePhotoUrl,
  initialNotifications,
}: {
  isAdmin: boolean;
  isFieldStaff: boolean;
  userName: string;
  userEmail: string;
  profilePhotoUrl: string | null;
  initialNotifications: Notification[];
}) {
  const pathname = usePathname();
  const visibleLinks = isAdmin ? links : fieldLinks;
  const showFieldGroup = isAdmin && isFieldStaff;
  const mobileLinks = showFieldGroup ? [...visibleLinks, ...fieldLinks] : visibleLinks;
  const onFieldSurface = fieldLinks.some(([href]) => isActive(pathname, href));
  const logoHref = isAdmin ? (showFieldGroup && onFieldSurface ? "/my-day" : "/dashboard") : "/my-day";
  const [menuOpen, setMenuOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const menuDialogRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const meDialogRef = useRef<HTMLDivElement>(null);
  const meTriggerRef = useRef<HTMLButtonElement>(null);

  function setDesktopNavCollapsed(collapsed: boolean) {
    document.documentElement.style.setProperty("--app-nav-width", collapsed ? "76px" : "260px");
    setNavCollapsed(collapsed);
  }

  useEffect(() => {
    if (!profileMenuOpen) return;
    function handleClick(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setProfileMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileMenuOpen]);

  const [menuClosedForPathname, setMenuClosedForPathname] = useState(pathname);
  if (pathname !== menuClosedForPathname) {
    setMenuClosedForPathname(pathname);
    setMenuOpen(false);
    setMeOpen(false);
  }

  useEffect(() => {
    if (!menuOpen && !meOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMeOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const activeDialog = meOpen ? meDialogRef.current : menuOpen ? menuDialogRef.current : null;
      if (!activeDialog) return;
      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trigger = meOpen ? meTriggerRef.current : menuOpen ? menuTriggerRef.current : null;
    let focusFrame: number | undefined;
    const activeDialog = meOpen ? meDialogRef.current : menuOpen ? menuDialogRef.current : null;
    if (activeDialog) {
      focusFrame = window.requestAnimationFrame(() => {
        const firstFocusable = activeDialog.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        );
        firstFocusable?.focus();
      });
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [menuOpen, meOpen]);

  return (
    <>
      {isAdmin ? (
      <>
      <div data-app-nav="mobile" className="sticky top-0 z-40 border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] pt-[env(safe-area-inset-top)] text-[var(--co-ink)] backdrop-blur xl:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            ref={menuTriggerRef}
            className="rounded-full p-2 transition-colors hover:bg-[var(--co-surface-muted)]"
          >
            <Menu aria-hidden="true" strokeWidth={1.75} className="h-5 w-5 text-[var(--co-ink)]" />
          </button>

          <Link href={logoHref} className="flex items-center gap-2">
            <Image src="/brand/logo-mark.png" alt="" aria-hidden="true" width={28} height={28} priority className="h-7 w-7 object-contain" />
            <span className="text-base font-bold text-[var(--co-accent-text)]">Shimmer</span>
          </Link>

          <div className="flex items-center gap-1">
            {isAdmin ? <CreateMenu compact /> : null}
            <ThemeToggle />
            {isAdmin ? <NotificationsMenu initialNotifications={initialNotifications} /> : null}
            {showFieldGroup ? <SurfaceSwitcher onFieldSurface={onFieldSurface} variant="icon" /> : null}
            <Link href="/account" aria-label="Account" className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-[var(--co-surface-muted)]">
              <CircleUserRound aria-hidden="true" strokeWidth={1.75} className="h-5 w-5 text-[var(--co-muted)]" />
            </Link>
          </div>
        </div>

        {isAdmin ? (
          <div className="border-t border-[var(--co-line-soft)] px-4 py-2">
            <GlobalSearch variant="mobile" />
          </div>
        ) : null}
      </div>

      <div
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity xl:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        ref={menuDialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[82vw] flex-col border-r border-[var(--co-line-soft)] bg-[var(--co-surface)] text-[var(--co-ink)] shadow-[0_0_40px_rgba(18,24,19,0.18)] transition-transform duration-300 ease-out xl:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--co-line-soft)] px-4 py-4">
          <Link href={logoHref} onClick={() => setMenuOpen(false)} className="flex items-center gap-2">
            <Image src="/brand/logo-mark.png" alt="" aria-hidden="true" width={32} height={32} priority className="h-8 w-8 object-contain" />
            <span className="text-base font-bold text-[var(--co-accent-text)]">Shimmer</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="rounded-full p-2 transition-colors hover:bg-[var(--co-surface-muted)]"
          >
            <Menu aria-hidden="true" strokeWidth={1.75} className="h-5 w-5 text-[var(--co-ink)]" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto px-3 py-4">
          {mobileLinks.map(([href, label]) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                    : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
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
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition ${
                  pathname.startsWith("/sync-issues")
                    ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                    : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                }`}
              >
                <NavIcon href="/sync-issues" />
                Sync issues
              </Link>
              <Link
                href="/leads"
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition ${
                  pathname.startsWith("/leads")
                    ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                    : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                }`}
              >
                <NavIcon href="/leads" />
                Leads
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition ${
                  pathname.startsWith("/settings")
                    ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                    : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                }`}
              >
                <NavIcon href="/settings" />
                Settings
              </Link>
            </>
          ) : null}

          <Link
            href="/help-center"
            onClick={() => setMenuOpen(false)}
            className={`flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium transition ${
              pathname.startsWith("/help-center")
                ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)]"
                : "text-[var(--co-muted)] hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            }`}
          >
            <NavIcon href="/help-center" />
            Support
          </Link>
        </nav>

        <div className="space-y-2 border-t border-[var(--co-line-soft)] p-3">
          <div className="overflow-hidden rounded-[14px] border border-[var(--co-line-soft)]">
            <ThemeToggleMenuItem />
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-[14px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--co-muted)] transition hover:border-[var(--co-line)] hover:text-[var(--co-ink)]"
            >
              <LogOut aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
              Sign out
            </button>
          </form>
        </div>
      </div>
      </>
      ) : (
      <>
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--co-line-soft)] bg-[var(--co-surface)]/95 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 backdrop-blur xl:hidden"
        >
          {fieldLinks.map(([href, label]) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-[var(--co-accent-text)]" : "text-[var(--co-muted)]"
                }`}
              >
                <NavIcon href={href} />
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMeOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={meOpen}
            ref={meTriggerRef}
            className={`flex min-h-11 flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
              meOpen ? "text-[var(--co-accent-text)]" : "text-[var(--co-muted)]"
            }`}
          >
            <ProfileAvatar profilePhotoUrl={profilePhotoUrl} userName={userName} size="h-[22px] w-[22px]" />
            Me
          </button>
        </nav>

        <div
          aria-hidden={!meOpen}
          onClick={() => setMeOpen(false)}
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity xl:hidden ${
            meOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        <div
          ref={meDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Account menu"
          aria-hidden={!meOpen}
          inert={!meOpen}
          tabIndex={-1}
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-y-auto rounded-t-[24px] border-t border-[var(--co-line-soft)] bg-[var(--co-surface)] pb-[calc(16px+env(safe-area-inset-bottom))] text-[var(--co-ink)] shadow-[0_-10px_40px_rgba(18,24,19,0.18)] transition-transform duration-300 ease-out xl:hidden ${
            meOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profilePhotoUrl={profilePhotoUrl} userName={userName} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--co-ink)]">{userName}</p>
                <p className="truncate text-[12px] text-[var(--co-faint)]">{userEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMeOpen(false)}
              aria-label="Close"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--co-muted)] transition-colors hover:bg-[var(--co-surface-muted)]"
            >
              <X aria-hidden="true" strokeWidth={1.75} className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-1 px-3 pb-2">
            <Link
              href="/account"
              onClick={() => setMeOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            >
              <CircleUserRound aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
              Account
            </Link>
            <Link
              href="/my-day/pto"
              onClick={() => setMeOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            >
              <CalendarCheck aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
              Time off
            </Link>
            <Link
              href="/help-center"
              onClick={() => setMeOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            >
              <NavIcon href="/help-center" />
              Help Center
            </Link>
            <Link
              href="/privacy-policy"
              onClick={() => setMeOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
            >
              <FileText aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
              Privacy Policy
            </Link>
          </nav>

          <div className="space-y-2 border-t border-[var(--co-line-soft)] px-3 pt-3">
            <div className="overflow-hidden rounded-[14px] border border-[var(--co-line-soft)]">
              <ThemeToggleMenuItem />
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-[14px] border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--co-muted)] transition hover:border-[var(--co-line)] hover:text-[var(--co-ink)]"
              >
                <LogOut aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </>
      )}

      <aside data-app-nav="desktop" className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] py-5 text-[var(--co-ink)] transition-[width,padding] duration-200 xl:flex ${
        navCollapsed ? "w-[76px] px-3" : "w-[260px] px-4"
      }`}>
        <div className={`mb-8 flex items-center ${navCollapsed ? "justify-center" : "gap-2"}`}>
          <Link
            href={logoHref}
            aria-label="Shimmer home"
            title={navCollapsed ? "Shimmer home" : undefined}
            className={`flex items-center rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] ${navCollapsed ? "h-12 w-12 justify-center" : "flex-1 gap-3 px-3 py-3"}`}
          >
          <Image src="/brand/logo-mark.png" alt="" aria-hidden="true" width={40} height={40} priority className="h-10 w-10 object-contain" />
          {navCollapsed ? null : <span>
            <span className="block text-[15px] font-semibold tracking-tight">Shimmer</span>
            <span className="block text-[11px] text-[var(--co-faint)]">operations desk</span>
          </span>}
          </Link>
          {navCollapsed ? null : <button
            type="button"
            onClick={() => setDesktopNavCollapsed(true)}
            aria-label="Minimize navigation"
            title="Minimize navigation"
            className="rounded-full p-2 text-[var(--co-muted)] transition hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
          >
            <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
          </button>}
        </div>

        {navCollapsed ? <button
          type="button"
          onClick={() => setDesktopNavCollapsed(false)}
          aria-label="Expand navigation"
          title="Expand navigation"
          className="mb-4 self-center rounded-full p-2 text-[var(--co-muted)] transition hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
        >
          <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
        </button> : null}

        {showFieldGroup ? (
          <div className={`mb-4 ${navCollapsed ? "flex justify-center" : ""}`}>
            <SurfaceSwitcher onFieldSurface={onFieldSurface} variant={navCollapsed ? "icon" : "full"} />
          </div>
        ) : null}

        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto">
          <div>
            {navCollapsed ? null : <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--co-faint)]">Workspace</p>}
            <SidebarLinks items={visibleLinks} pathname={pathname} navCollapsed={navCollapsed} />
          </div>

          {showFieldGroup ? (
            <div>
              {navCollapsed ? null : <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--co-faint)]">Field</p>}
              <SidebarLinks items={fieldLinks} pathname={pathname} navCollapsed={navCollapsed} />
            </div>
          ) : null}

          <div className="space-y-1 border-t border-[var(--co-line-soft)] pt-3">
            {isAdmin ? (
              <>
                <Link
                  href="/sync-issues"
                  aria-current={pathname.startsWith("/sync-issues") ? "page" : undefined}
                  aria-label={navCollapsed ? "Sync issues" : undefined}
                  title={navCollapsed ? "Sync issues" : undefined}
                  className={`flex items-center rounded-[14px] py-[0.6875rem] text-[13px] transition ${navCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${
                    pathname.startsWith("/sync-issues")
                      ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)] font-medium"
                      : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
                  }`}
                >
                  <span className={navCollapsed ? "" : "ml-1"}>
                    <NavIcon href="/sync-issues" />
                  </span>
                  {navCollapsed ? null : <span>Sync issues</span>}
                </Link>
                <Link
                  href="/leads"
                  aria-current={pathname.startsWith("/leads") ? "page" : undefined}
                  aria-label={navCollapsed ? "Leads" : undefined}
                  title={navCollapsed ? "Leads" : undefined}
                  className={`flex items-center rounded-[14px] py-[0.6875rem] text-[13px] transition ${navCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${
                    pathname.startsWith("/leads")
                      ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)] font-medium"
                      : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
                  }`}
                >
                  <span className={navCollapsed ? "" : "ml-1"}>
                    <NavIcon href="/leads" />
                  </span>
                  {navCollapsed ? null : <span>Leads</span>}
                </Link>
                <Link
                  href="/settings"
                  aria-current={pathname.startsWith("/settings") ? "page" : undefined}
                  aria-label={navCollapsed ? "Settings" : undefined}
                  title={navCollapsed ? "Settings" : undefined}
                  className={`flex items-center rounded-[14px] py-[0.6875rem] text-[13px] transition ${navCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${
                    pathname.startsWith("/settings")
                      ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)] font-medium"
                      : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
                  }`}
                >
                  <span className={navCollapsed ? "" : "ml-1"}>
                    <NavIcon href="/settings" />
                  </span>
                  {navCollapsed ? null : <span>Settings</span>}
                </Link>
              </>
            ) : null}
            <Link
              href="/help-center"
              aria-current={pathname.startsWith("/help-center") ? "page" : undefined}
              aria-label={navCollapsed ? "Support" : undefined}
              title={navCollapsed ? "Support" : undefined}
              className={`flex items-center rounded-[14px] py-[0.6875rem] text-[13px] transition ${navCollapsed ? "justify-center px-2" : "gap-3 px-3"} ${
                pathname.startsWith("/help-center")
                  ? "bg-[var(--co-accent-tint)] text-[var(--co-accent-text)] font-medium"
                  : "text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-ink)]"
              }`}
            >
              <span className={navCollapsed ? "" : "ml-1"}>
                <NavIcon href="/help-center" />
              </span>
              {navCollapsed ? null : <span>Support</span>}
            </Link>
          </div>
        </nav>

        <div className="mt-auto space-y-3">
          <div ref={profileMenuRef} className={`relative ${navCollapsed ? "flex justify-center" : ""}`}>
            {profileMenuOpen ? (
              <div
                role="menu"
                className={`absolute bottom-full mb-2 overflow-hidden rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] py-1 shadow-[0_10px_32px_rgba(18,24,19,0.12)] ${navCollapsed ? "left-0 w-[180px]" : "inset-x-0"}`}
              >
                <ThemeToggleMenuItem />
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
                  >
                    <LogOut aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setProfileMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label={navCollapsed ? "Account menu" : undefined}
              title={navCollapsed ? "Account menu" : undefined}
              className={`flex items-center rounded-[18px] border border-[var(--co-line-soft)] bg-[var(--co-surface)] py-2.5 text-left transition hover:border-[var(--co-line)] ${navCollapsed ? "w-12 justify-center px-0" : "w-full gap-3 px-3"}`}
            >
              <ProfileAvatar profilePhotoUrl={profilePhotoUrl} userName={userName} size="h-9 w-9" />
              {navCollapsed ? null : <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[var(--co-ink)]">{userName}</span>
                <span className="block truncate text-[11px] text-[var(--co-faint)]">{userEmail}</span>
              </span>}
              {navCollapsed ? null : <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--co-faint)] transition-transform ${profileMenuOpen ? "rotate-180" : ""}`} aria-hidden />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
