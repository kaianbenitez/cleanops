import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { ptoRequests, users } from "@/db/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  const requests = await db.select({
    id: ptoRequests.id,
    startDate: ptoRequests.startDate,
    endDate: ptoRequests.endDate,
    startPeriod: ptoRequests.startPeriod,
    endPeriod: ptoRequests.endPeriod,
    note: ptoRequests.note,
    status: ptoRequests.status,
    createdAt: ptoRequests.createdAt,
    employeeFirstName: users.firstName,
    employeeLastName: users.lastName,
  }).from(ptoRequests).innerJoin(users, eq(ptoRequests.userId, users.id)).where(and(
    eq(ptoRequests.companyId, admin.companyId),
    eq(ptoRequests.userId, employeeId),
  )).orderBy(desc(ptoRequests.createdAt));
  return NextResponse.json({ requests });
}
