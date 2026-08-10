import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { employeePto, ptoRequests } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current-user";

const decisionSchema = z.object({ decision: z.enum(["approved", "denied"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ employeeId: string; requestId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId, requestId } = await params;
  const parsed = decisionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Decision must be approved or denied." }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(ptoRequests).where(and(
      eq(ptoRequests.id, requestId),
      eq(ptoRequests.companyId, admin.companyId),
      eq(ptoRequests.userId, employeeId),
      eq(ptoRequests.status, "pending"),
    )).limit(1);
    if (!request) return null;

    const [updated] = await tx.update(ptoRequests).set({
      status: parsed.data.decision,
      decidedAt: new Date(),
      decidedBy: admin.id,
    }).where(and(eq(ptoRequests.id, request.id), eq(ptoRequests.status, "pending"))).returning();
    if (!updated) return null;

    if (parsed.data.decision === "approved") {
      await tx.insert(employeePto).values({
        companyId: admin.companyId,
        userId: request.userId,
        startDate: request.startDate,
        endDate: request.endDate,
        startPeriod: request.startPeriod,
        endPeriod: request.endPeriod,
        note: request.note,
      });
    }
    return updated;
  });

  if (!result) return NextResponse.json({ error: "This request is no longer pending or was not found." }, { status: 409 });
  return NextResponse.json({ request: result });
}
