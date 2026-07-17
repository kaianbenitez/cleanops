import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth/current-user";
import { buildGoogleAuthUrl } from "@/lib/gmail/client";

const STATE_COOKIE = "cleanops_gmail_oauth_state";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const redirectUri = new URL("/api/integrations/gmail/callback", req.url).toString();
  const state = randomUUID();
  const response = NextResponse.redirect(buildGoogleAuthUrl({ state, redirectUri }));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}

