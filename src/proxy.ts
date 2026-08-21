import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { resolveRootRequest } from "@/lib/auth/root-redirect";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return await resolveRootRequest(request);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ]
};
