/**
 * Non-identifying reasons the /login screen can state for why it appeared.
 * Never a token, password, email, or return URL that could identify a
 * session — see WP-E §6.
 */
export const LOGIN_REASONS = ["expired", "no_session", "signed_out", "unknown"] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

function isLoginReason(value: string | null | undefined): value is LoginReason {
  return value != null && (LOGIN_REASONS as readonly string[]).includes(value);
}

const LOGIN_REASON_MESSAGES: Record<LoginReason, string> = {
  expired: "Your sign-in expired. Sign in again to get back to your day — nothing you recorded was lost.",
  signed_out: "You signed out. Sign in when you're ready.",
  no_session: "Sign in to see your day.",
  unknown: "Sign in to see your day.",
};

/** Falls back to the generic `no_session` copy for a missing or unrecognised
 * value instead of throwing — the redirect that sets this param isn't the
 * only way to reach /login (a bookmark, a stale link, a manual edit), so an
 * invalid value here must still render something sensible. */
export function loginReasonMessage(value: string | null | undefined): string {
  return LOGIN_REASON_MESSAGES[isLoginReason(value) ? value : "no_session"];
}

/** True when an `sb-*` auth cookie (chunked or not) is present on the
 * request. A request with none redirects to /login for the ordinary,
 * expected reason (`no_session`) — nothing worth diagnosing. */
export function hasAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/** True when the auth cookie was split into `.0`, `.1`, ... parts —
 * @supabase/ssr chunks cookies over ~4KB. A diagnostic signal, not a secret. */
export function isChunkedAuthCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => /-auth-token\.\d+$/.test(name));
}

/** Classifies why a request carrying an auth cookie still resolved to no
 * user, from the *shape* of the Supabase error only (its code/message
 * category) — never logs the message text itself, and never inspects the
 * cookie or token value. */
export function classifyStaleCookieReason(error: { code?: string; message?: string } | null): "expired" | "unknown" {
  const signal = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    signal.includes("expired") ||
    signal.includes("refresh_token_not_found") ||
    signal.includes("invalid refresh token")
  ) {
    return "expired";
  }
  return "unknown";
}
