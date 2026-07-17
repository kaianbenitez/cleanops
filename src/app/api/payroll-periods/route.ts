import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { payrollPeriods } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

const createPeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** GET /api/payroll-periods — most recent periods first. */
export async function GET() {
  const admin = await requireAdmin();

  const periods = await db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.companyId, admin.companyId))
    .orderBy(desc(payrollPeriods.startDate));

  return NextResponse.json({ periods });
}

/** POST /api/payroll-periods — creates a period (or returns the existing one for that range). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createPeriodSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { startDate, endDate } = parsed.data;

  const [existing] = await db
    .select()
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.companyId, admin.companyId),
        eq(payrollPeriods.startDate, startDate),
        eq(payrollPeriods.endDate, endDate)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ period: existing });
  }

  const [period] = await db
    .insert(payrollPeriods)
    .values({ companyId: admin.companyId, startDate, endDate })
    .returning();

  return NextResponse.json({ period }, { status: 201 });
}
