"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { SURFACE_COOKIE } from "@/lib/auth/surface";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Rendered only for hybrid admin + field-staff users (AppNav gates this).
 * Writes the per-device surface preference the landing page reads (H5) —
 * this is what makes the mobile-UA guess there safe to be wrong. */
export default function SurfaceSwitcher({
  onFieldSurface,
  variant = "full",
}: {
  onFieldSurface: boolean;
  variant?: "full" | "icon";
}) {
  const router = useRouter();
  const targetSurface = onFieldSurface ? "admin" : "field";
  const targetHref = onFieldSurface ? "/dashboard" : "/my-day";
  const label = onFieldSurface ? "Switch to Admin" : "Switch to My Day";

  function handleClick() {
    document.cookie = `${SURFACE_COOKIE}=${targetSurface}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    router.push(targetHref);
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        title={label}
        className="rounded-full p-2 transition-colors hover:bg-[var(--co-surface-muted)]"
      >
        <ArrowLeftRight aria-hidden="true" strokeWidth={2} className="h-5 w-5 text-[var(--co-muted)]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="flex w-full items-center gap-3 rounded-[14px] border border-[var(--co-line-soft)] bg-[var(--co-accent-tint)] px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--co-accent-text)] transition hover:border-[var(--co-line)]"
    >
      <ArrowLeftRight aria-hidden="true" strokeWidth={1.75} className="h-[18px] w-[18px] shrink-0" />
      {label}
    </button>
  );
}
