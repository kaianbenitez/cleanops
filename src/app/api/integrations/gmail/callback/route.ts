import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, gmailConnections } from "@/db/schema";
import { decodeJwtPayload, exchangeGoogleAuthorizationCode } from "@/lib/gmail/client";

const STATE_COOKIE = "cleanops_gmail_oauth_state";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const redirectPath = "/settings/gmail";

  if (error) {
    return NextResponse.redirect(new URL(`${redirectPath}?error=${encodeURIComponent(error)}`, req.url));
  }

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL(`${redirectPath}?error=${encodeURIComponent("Google sign-in was not completed.")}`, req.url));
  }

  const redirectUri = new URL("/api/integrations/gmail/callback", req.url).toString();
  try {
    const token = await exchangeGoogleAuthorizationCode({ code, redirectUri });
    const payload = token.id_token ? decodeJwtPayload<{ email?: string; name?: string }>(token.id_token) : null;
    const senderEmail = payload?.email;
    if (!senderEmail) throw new Error("Google did not return the sender email.");

    const [existing] = await db
      .select()
      .from(gmailConnections)
      .where(eq(gmailConnections.companyId, admin.companyId))
      .limit(1);

    const refreshToken = token.refresh_token || existing?.refreshToken;
    if (!refreshToken) throw new Error("Google did not return a refresh token. Reconnect and approve the Gmail send scope.");

    const [saved] = await db
      .insert(gmailConnections)
      .values({
        id: existing?.id ?? randomUUID(),
        companyId: admin.companyId,
        senderEmail,
        senderName: payload?.name ?? null,
        refreshToken,
        scopes: token.scope ? token.scope.split(" ") : ["https://www.googleapis.com/auth/gmail.send"],
        connectedAt: existing?.connectedAt ?? new Date(),
        lastUsedAt: existing?.lastUsedAt ?? null,
      })
      .onConflictDoUpdate({
        target: gmailConnections.companyId,
        set: {
          senderEmail,
          senderName: payload?.name ?? null,
          refreshToken,
          scopes: token.scope ? token.scope.split(" ") : ["https://www.googleapis.com/auth/gmail.send"],
          updatedAt: new Date(),
        },
      })
      .returning();

    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: existing ? "gmail.reconnected" : "gmail.connected",
      entityType: "integration",
      entityId: saved.id,
      before: existing ? { senderEmail: existing.senderEmail } : null,
      after: { senderEmail: saved.senderEmail, senderName: saved.senderName, scopes: saved.scopes },
    });

    const response = NextResponse.redirect(new URL(`${redirectPath}?connected=1`, req.url));
    response.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (err) {
    return NextResponse.redirect(new URL(`${redirectPath}?error=${encodeURIComponent(err instanceof Error ? err.message : "Could not connect Gmail.")}`, req.url));
  }
}

