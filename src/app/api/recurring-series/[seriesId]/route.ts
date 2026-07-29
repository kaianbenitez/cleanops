import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, recurringSeries } from "@/db/schema";

const updateSeriesSchema = z.object({ action: z.enum(["suspend", "cancel"]) });

/** Stops a recurring series and archives the associated customer. Already-created
 * visits are deliberately retained so dispatch can review or cancel each one. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ seriesId: string }> }) {
  const admin = await requireAdmin();
  const { seriesId } = await params;
  const parsed = updateSeriesSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [series] = await db.select().from(recurringSeries).where(and(eq(recurringSeries.id, seriesId), eq(recurringSeries.companyId, admin.companyId))).limit(1);
  if (!series) return NextResponse.json({ error: "Recurring service not found." }, { status: 404 });
  if (!series.isActive) return NextResponse.json({ error: "This recurring service has already ended." }, { status: 409 });

  const reason = parsed.data.action === "suspend" ? "Recurring service suspended" : "Recurring service cancelled";
  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    await tx.update(recurringSeries).set({ isActive: false, endDate: today, updatedAt: new Date() }).where(eq(recurringSeries.id, seriesId));
    await tx.update(customers).set({ isArchived: true, archivedAt: new Date(), archivedReason: reason, updatedAt: new Date() }).where(and(eq(customers.id, series.customerId), eq(customers.companyId, admin.companyId)));
    await tx.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: `recurring_service.${parsed.data.action}ed`, entityType: "recurring_series", entityId: seriesId, before: { isActive: true, endDate: series.endDate }, after: { isActive: false, endDate: today, customerArchived: true } });
  });

  return NextResponse.json({ ok: true, message: `${parsed.data.action === "suspend" ? "Suspended" : "Cancelled"} recurring service. Existing future visits were kept for review.` });
}
