/** Cookie name for the per-device field/admin surface preference used by the
 * landing-page precedence chain (src/app/page.tsx) and the surface switcher.
 * A UI preference only — never treated as a grant; the route guards in
 * field-staff.ts do the real enforcement. Not `httpOnly` since the switcher
 * writes it client-side. */
export const SURFACE_COOKIE = "ss_surface";
