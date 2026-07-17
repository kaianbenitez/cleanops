import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { quotes, jobs, recurringSeries, customers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateJobsForSeries } from "@/lib/scheduling/generate-jobs";
import type { PricingBreakdown, ServiceType } from "@/lib/pricing/calculate";
import { syncToGhl } from "@/lib/ghl/sync";

const convertSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string().uuid()).optional(),
  forceJob: z.boolean().optional(),
});

// Recurring service types spin up a recurring_series (+ its first 8 weeks of
// jobs); everything else becomes a single job. "four_weeks" maps to the
// existing every4weeks recurrence frequency from Phase 1.
const RECURRING_TYPES: Record<string, "weekly" | "biweekly" | "every4weeks"> = {
  weekly: "weekly",
  biweekly: "biweekly",
  four_weeks: "every4weeks",
};

const ONE_OFF_JOB_TYPE: Record<string, "first_clean" | "deep_clean" | "move_out"> = {
  first_time: "first_clean",
  deep: "deep_clean",
  supreme_deep: "deep_clean",
  move_in_out: "move_out",
};

/** POST /api/quotes/[quoteId]/convert — an accepted quote becomes a job (one-off
 * service types) or a recurring series (weekly/biweekly/four_weeks). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  const admin = await requireAdmin();
  const { quoteId } = await params;
  const body = await req.json();
  const parsed = convertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId)))
    .limit(1);

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.status !== "accepted" && !parsed.data.forceJob) {
    return NextResponse.json({ error: "Only accepted quotes can be converted" }, { status: 400 });
  }
  const serviceType = quote.acceptedServiceType ?? quote.requestedServiceType;
  if (!serviceType) {
    return NextResponse.json({ error: "Quote has no accepted service type" }, { status: 400 });
  }

  const { startDate, employeeIds } = parsed.data;
  const recurrenceFrequency = RECURRING_TYPES[serviceType];

  if (recurrenceFrequency) {
    const dayOfWeek = new Date(`${startDate}T00:00:00.000Z`).getUTCDay();
    const [series] = await db
      .insert(recurringSeries)
      .values({
        companyId: admin.companyId,
        customerId: quote.customerId,
        frequency: recurrenceFrequency,
        dayOfWeek,
        startDate,
        priceCents: quote.totalCents,
        defaultEmployeeIds: employeeIds ?? [],
        isActive: true,
      })
      .returning();

    const generation = await generateJobsForSeries(series.id);

    // PLAN.md §6: "Customer -> client + recurrence set" -> tags client +
    // recurrence-<freq>, removes sales-stage tags.
    await db
      .update(customers)
      .set({ status: "client", recurrence: recurrenceFrequency })
      .where(eq(customers.id, quote.customerId));
    await syncToGhl(admin.companyId, {
      type: "customer.became_client",
      customerId: quote.customerId,
      recurrence: recurrenceFrequency,
    });

    return NextResponse.json({ series, generation }, { status: 201 });
  }

  const jobType = ONE_OFF_JOB_TYPE[serviceType] ?? "one_time";

  // Job Ticket Hours: derived from the ACCEPTED tier's own room-weight
  // breakdown (sum of weightHours x count across every room), not a guess —
  // this feeds Phase 2 payroll's commission_jth calculation directly.
  const allTierPricing = quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null;
  const acceptedBreakdown = allTierPricing?.[serviceType];
  const totalHours = (acceptedBreakdown?.roomLines ?? []).reduce((sum, l) => sum + l.weightHours * l.count, 0);
  const estimatedDurationMinutes = Math.max(60, Math.round(totalHours * 60));

  const [job] = await db
    .insert(jobs)
    .values({
      companyId: admin.companyId,
      customerId: quote.customerId,
      quoteId: quote.id,
      type: jobType,
      status: "scheduled",
      scheduledDate: startDate,
      scheduledStartTime: "09:00:00",
      estimatedDurationMinutes,
      priceCents: quote.totalCents,
    })
    .returning();

  // PLAN.md §6: "First clean scheduled" -> set first_cleaning_date, tag
  // first-clean-booked (kills the manual GHL date entry). Only for the
  // first_clean job type — deep_clean/move_out one-offs have no customer
  // status transition or GHL event specified in the plan.
  if (jobType === "first_clean") {
    await db
      .update(customers)
      .set({ status: "first_clean_booked" })
      .where(eq(customers.id, quote.customerId));
    await syncToGhl(admin.companyId, {
      type: "first_clean.scheduled",
      customerId: quote.customerId,
      scheduledDate: startDate,
    });
  }

  return NextResponse.json({ job }, { status: 201 });
}
