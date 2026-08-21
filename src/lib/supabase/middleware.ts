import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";
import { classifyStaleCookieReason, hasAuthCookie, isChunkedAuthCookie, type LoginReason } from "./login-reason";

/** Creates a request-scoped Supabase client and resolves the auth user,
 * returning the response that carries any refreshed session cookies.
 * Shared by `updateSession` (all other routes) and the `/`-specific
 * redirect resolution in `root-redirect.ts`, so both stay on one Supabase
 * round trip instead of drifting into duplicate client setup.
 *
 * Also classifies `authRedirectReason` (WP-E diagnosis): when a request
 * carries an `sb-*` auth cookie but resolves to no user, that's the "stale
 * cookie" case worth logging — the four hypotheses in
 * `Workday Ledger/WP-E Sign-in Continuity.md` §2 (iOS PWA storage isolation,
 * Safari ITP's 7-day cap, Supabase token settings, Turnstile friction) all
 * surface here identically, so the log line only records the *shape* of the
 * failure (path, whether the cookie was chunked, expired-vs-unknown), never
 * a token, cookie, or user value. */
export async function getSessionUser(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name);
  let authRedirectReason: LoginReason = "no_session";

  if (!user && hasAuthCookie(cookieNames)) {
    authRedirectReason = classifyStaleCookieReason(error);
    console.log(
      JSON.stringify({
        event: "auth.stale_cookie",
        path: request.nextUrl.pathname,
        chunked: isChunkedAuthCookie(cookieNames),
        reason: authRedirectReason,
      })
    );
  }

  return { user, response, authRedirectReason };
}

export async function updateSession(request: NextRequest) {
  const { user, response: supabaseResponse, authRedirectReason } = await getSessionUser(request);

  const isRootRoute = request.nextUrl.pathname === "/";
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/quote/") ||
    request.nextUrl.pathname.startsWith("/api/webhooks/") ||
    request.nextUrl.pathname.startsWith("/api/public/") ||
    request.nextUrl.pathname.startsWith("/api/leads") ||
    request.nextUrl.pathname === "/privacy-policy" ||
    request.nextUrl.pathname === "/terms";

  if (!user && !isRootRoute && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("reason", authRedirectReason);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
