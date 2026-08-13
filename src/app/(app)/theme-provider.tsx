"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "co-theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Scopes the `dark` class to this shell (the authenticated app), not
 * `<html>` — the public marketing/quote/feedback pages have no dark
 * palette and should never pick up an admin's stored preference.
 */
export default function ThemeProvider({ children, className }: { children: ReactNode; className: string }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme =
      stored === "dark" || stored === "light" ? stored : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage/matchMedia are unavailable during SSR, so the real preference can only be read once mounted.
    setTheme(initial);
    shellRef.current?.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      shellRef.current?.classList.toggle("dark", next === "dark");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div ref={shellRef} className={className}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
