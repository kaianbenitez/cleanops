import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, employeePto, users } from "@/db/schema";

const ptoSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: z.enum(["full", "morning", "afternoon"]),
  endPeriod: z.enum(["full", "morning", "afternoon"]),
  note: z.string().trim().max(240).optional().nullable(),
}).refine((value) => value.startDate <= value.endDate, {
  message: "The end date must be on or after the start date.",
  path: ["endDate"],
});

async function getPto(companyId: string, employeeId: string, ptoId: string) {
  const [row] = await db
    .select({ pto: employeePto, employeeName: users.firstName })
    .from(employeePto)
    .innerJoin(users, eq(employeePto.userId, users.id))
    .where(and(eq(employeePto.id, ptoId), eq(employeePto.userId, employeeId), eq(employeePto.companyId, companyId)))
    .limit(1);
  return row?.pto;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string; ptoId: string }> },
) {
  const admin = await requireAdmin();
  const { employeeId, ptoId } = await params;
  const existing = await getPto(admin.companyId, employeeId, ptoId);
  if (!existing) return NextResponse.json({ error: "PTO entry not found" }, { status: 404 });
  const parsed = ptoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid PTO range." }, { status: 400 });

  const [updated] = await db.update(employeePto).set(parsed.data).where(eq(employeePto.id, ptoId)).returning();
  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "employee.pto_updated",
    entityType: "employee_pto",
    entityId: ptoId,
    before: existing,
    after: updated,
  });
  return NextResponse.json({ pto: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string; ptoId: string }> },
) {
  const admin = await requireAdmin();
  const { employeeId, ptoId } = await params;
  const existing = await getPto(admin.companyId, employeeId, ptoId);
  if (!existing) return NextResponse.json({ error: "PTO entry not found" }, { status: 404 });

  await db.delete(employeePto).where(eq(employeePto.id, ptoId));
  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "employee.pto_deleted",
    entityType: "employee_pto",
    entityId: ptoId,
    before: existing,
    after: null,
  });
  return NextResponse.json({ ok: true });
}
