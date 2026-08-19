import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

/** Creates a request-scoped Supabase client and resolves the auth user,
 * returning the response that carries any refreshed session cookies.
 * Shared by `updateSession` (all other routes) and the `/`-specific
 * redirect resolution in `root-redirect.ts`, so both stay on one Supabase
 * round trip instead of drifting into duplicate client setup. */
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
  } = await supabase.auth.getUser();

  return { user, response };
}

export async function updateSession(request: NextRequest) {
  const { user, response: supabaseResponse } = await getSessionUser(request);

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
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
