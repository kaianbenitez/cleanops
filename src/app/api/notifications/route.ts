import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { appNotifications } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";

const MAX_NOTIFICATIONS = 20;

export async function GET() {
  const admin = await requireAdmin();
  const notifications = await db.select({ id: appNotifications.id, title: appNotifications.title, body: appNotifications.body, href: appNotifications.href, readAt: appNotifications.readAt, createdAt: appNotifications.createdAt }).from(appNotifications).where(eq(appNotifications.companyId, admin.companyId)).orderBy(desc(appNotifications.createdAt)).limit(MAX_NOTIFICATIONS);
  return NextResponse.json({ notifications });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const now = new Date();
  if (body?.all === true) {
    await db.update(appNotifications).set({ readAt: now }).where(and(eq(appNotifications.companyId, admin.companyId), isNull(appNotifications.readAt)));
    return NextResponse.json({ ok: true });
  }
  if (typeof body?.id !== "string") return NextResponse.json({ error: "Notification id is required" }, { status: 400 });
  await db.update(appNotifications).set({ readAt: now }).where(and(eq(appNotifications.id, body.id), eq(appNotifications.companyId, admin.companyId)));
  return NextResponse.json({ ok: true });
}
