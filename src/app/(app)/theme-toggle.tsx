"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

/** Compact icon button for the desktop header and mobile top bar. */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full p-2 text-[var(--co-muted)] transition-colors hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
    >
      {dark ? <Sun aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px]" />}
    </button>
  );
}

/** Labeled row for menus (mobile drawer, desktop profile dropdown). */
export function ThemeToggleMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="menuitem"
      onClick={toggleTheme}
      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] text-[var(--co-muted)] transition hover:bg-[var(--co-surface-muted)] hover:text-[var(--co-ink)]"
    >
      <span className="flex items-center gap-3">
        {dark ? <Sun aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" /> : <Moon aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0 opacity-90" />}
        {dark ? "Light mode" : "Dark mode"}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${dark ? "bg-[var(--co-accent-fill)]" : "bg-[var(--co-line)]"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${dark ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
