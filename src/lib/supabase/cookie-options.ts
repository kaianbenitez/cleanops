/**
 * Keep the browser cookie available long enough for Supabase to refresh the
 * session. The one-hour access token is intentionally short-lived; the
 * rotating refresh token is what lets a personal phone stay signed in.
 *
 * Keep these options shared by browser, server, and middleware clients. A
 * mismatch can make a refreshed cookie disappear or become route-scoped.
 */
export const AUTH_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
} as const;
