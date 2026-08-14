/** Cookie name for the per-device field/admin surface preference used by the
 * landing-page precedence chain (src/app/page.tsx) and the surface switcher.
 * A UI preference only — never treated as a grant; the route guards in
 * field-staff.ts do the real enforcement. Not `httpOnly` since the switcher
 * writes it client-side. */
export const SURFACE_COOKIE = "ss_surface";

/** Pure decision logic for `/`'s landing redirect (Hybrid Employee Access
 * Plan.md, H5), pulled out of the page component so the precedence order can
 * be unit tested without a request/DB. `hasJobToday` is the caller's
 * responsibility to compute (or skip) — see the short-circuit note on the
 * `isMobile && !surfaceCookie` path in `src/app/page.tsx`. */
export function resolveLandingSurface({
  isAdmin,
  hasField,
  surfaceCookie,
  isMobile,
  hasJobToday,
}: {
  isAdmin: boolean;
  hasField: boolean;
  surfaceCookie: "field" | "admin" | undefined;
  isMobile: boolean;
  hasJobToday: boolean;
}): "/my-day" | "/dashboard" {
  if (!isAdmin) return "/my-day";
  if (!hasField) return "/dashboard";
  if (surfaceCookie === "field") return "/my-day";
  if (surfaceCookie === "admin") return "/dashboard";
  if (isMobile && hasJobToday) return "/my-day";
  return "/dashboard";
}
