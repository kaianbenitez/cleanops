import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, gmailConnections } from "@/db/schema";

export async function POST() {
  const admin = await requireAdmin();
  const [existing] = await db.select().from(gmailConnections).where(eq(gmailConnections.companyId, admin.companyId)).limit(1);

  if (existing) {
    await db.delete(gmailConnections).where(eq(gmailConnections.companyId, admin.companyId));
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "gmail.disconnected",
      entityType: "integration",
      entityId: existing.id,
      before: { senderEmail: existing.senderEmail },
      after: null,
    });
  }

  return NextResponse.json({ ok: true });
}

