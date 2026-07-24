"use client";

/** Renders a timestamp in the viewer's own local timezone. Needed anywhere a server
 * component would otherwise format the date at request-time (server's timezone,
 * not the browser's) — marking this "use client" forces it to actually run in the
 * browser; `suppressHydrationWarning` covers the one-time mismatch between the
 * server's render pass and the browser's real timezone/locale. */
export function LocalDateTime({
  value,
  options = { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" },
  fallback = "—",
}: {
  value: string | Date | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  if (!value) return <>{fallback}</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{fallback}</>;
  return <span suppressHydrationWarning>{date.toLocaleString(undefined, options)}</span>;
}
