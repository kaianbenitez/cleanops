import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { recurringSeries, customers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateJobsForSeries } from "@/lib/scheduling/generate-jobs";

const createSeriesSchema = z.object({
  customerId: z.string().uuid(),
  frequency: z.enum(["weekly", "biweekly", "every4weeks", "monthly", "custom"]),
  intervalWeeks: z.number().int().min(1).max(52).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priceCents: z.number().int().positive(),
  employeeIds: z.array(z.string().uuid()).optional(),
});

/** POST /api/recurring-series — creates a series and immediately generates at least its first 3 months of jobs. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createSeriesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  if (data.frequency === "custom" && data.intervalWeeks === undefined) {
    return NextResponse.json({ error: "Custom recurring series require an interval in weeks." }, { status: 400 });
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const [series] = await db
    .insert(recurringSeries)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      frequency: data.frequency,
      intervalWeeks: data.frequency === "custom" ? data.intervalWeeks : null,
      dayOfWeek: data.dayOfWeek,
      startDate: data.startDate,
      endDate: data.endDate,
      priceCents: data.priceCents,
      defaultEmployeeIds: data.employeeIds ?? [],
      isActive: true,
    })
    .returning();

  const generation = await generateJobsForSeries(series.id);

  return NextResponse.json({ series, generation }, { status: 201 });
}
