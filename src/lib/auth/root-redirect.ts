import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/supabase/middleware";
import { hasAdminAccess, hasFieldAccess } from "./field-staff";
import { resolveLandingSurface, SURFACE_COOKIE } from "./surface";
import { hasAssignmentToday } from "@/lib/my-day/assignment";

// Same UA check as the old page.tsx (H5/H6). Covers phones on both iOS and
// Android; tablets fall through to the admin-default branch, which the
// surface switcher can override.
const MOBILE_UA_PATTERN = /Mobi/i;

/** True the moment any Supabase auth cookie is present, chunked or not —
 * cheap enough to check before paying for a Supabase round trip. Lets `/`
 * skip straight to a static response for the stranger/Googlebot case that
 * makes up nearly all traffic to the marketing page. */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

/** `/` does double duty: marketing page for logged-out visitors, surface-
 * resolution redirect for logged-in ones. This used to live in page.tsx,
 * which forced every anonymous visit (and every crawl) into a dynamic
 * render just to discover it had no session. Moved here so the page itself
 * can stay a static render — this is the only thing standing between it and
 * the cache. Mirrors the old page.tsx precedence exactly. */
export async function resolveRootRequest(request: NextRequest): Promise<NextResponse> {
  if (!hasSupabaseSessionCookie(request)) {
    return NextResponse.next({ request });
  }

  const { user: authUser, response } = await getSessionUser(request);
  if (!authUser) return response;

  const [profile] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  if (!profile) return response;

  const isAdmin = hasAdminAccess(profile);
  const hasField = hasFieldAccess(profile);
  const rawSurfaceCookie = request.cookies.get(SURFACE_COOKIE)?.value;
  const surfaceCookie = rawSurfaceCookie === "field" || rawSurfaceCookie === "admin" ? rawSurfaceCookie : undefined;
  const isMobile = MOBILE_UA_PATTERN.test(request.headers.get("user-agent") ?? "");

  // Only hit the DB for hybrids with no cookie yet; every other branch
  // resolves without it, and hasJobToday is unused when it does.
  const needsJobCheck = isAdmin && hasField && !surfaceCookie && isMobile;
  const hasJobToday = needsJobCheck ? await hasAssignmentToday(profile.id, profile.companyId) : false;

  const destination = resolveLandingSurface({ isAdmin, hasField, surfaceCookie, isMobile, hasJobToday });
  const url = request.nextUrl.clone();
  url.pathname = destination;
  const redirectResponse = NextResponse.redirect(url);
  // Carry over any refreshed Supabase session cookies onto the redirect.
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}
