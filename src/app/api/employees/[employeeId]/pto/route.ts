import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, users, employeePto } from "@/db/schema";
import { listEmployeePto } from "@/lib/scheduling/pto";

const ptoSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startPeriod: z.enum(["full", "morning", "afternoon"]).default("full"),
  endPeriod: z.enum(["full", "morning", "afternoon"]).default("full"),
  note: z.string().trim().max(240).optional().nullable(),
}).refine((value) => value.startDate <= value.endDate, {
  message: "The end date must be on or after the start date.",
  path: ["endDate"],
});

async function getEmployee(companyId: string, employeeId: string) {
  const [employee] = await db
    .select({ id: users.id, companyId: users.companyId, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.id, employeeId), eq(users.companyId, companyId)))
    .limit(1);
  return employee;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const employee = await getEmployee(admin.companyId, employeeId);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const searchParams = new URL(req.url).searchParams;
  const pto = await listEmployeePto({
    companyId: admin.companyId,
    userId: employeeId,
    startDate: searchParams.get("start") ?? undefined,
    endDate: searchParams.get("end") ?? undefined,
  });
  return NextResponse.json({ pto });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const employee = await getEmployee(admin.companyId, employeeId);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const parsed = ptoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid PTO range." }, { status: 400 });

  const [created] = await db.insert(employeePto).values({
    companyId: admin.companyId,
    userId: employeeId,
    ...parsed.data,
  }).returning();

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "employee.pto_created",
    entityType: "employee_pto",
    entityId: created.id,
    before: null,
    after: created,
  });

  return NextResponse.json({ pto: created }, { status: 201 });
}
