import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, quotes, jobs, recurringSeries, customers, serviceLocations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateJobsForSeries } from "@/lib/scheduling/generate-jobs";
import { estimateDurationMinutesFromPrice, SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { syncToGhl } from "@/lib/ghl/sync";

const convertSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string().uuid()).optional(),
  // Office staff can select any service that was priced on the quote when
  // scheduling with recorded approval, even before the public quote is accepted.
  serviceType: z.enum(SERVICE_TYPES).optional(),
  forceJob: z.boolean().optional(),
  overrideReason: z.string().trim().min(1).max(1000).optional(),
});

// Recurring service types spin up a recurring_series (+ at least its first 3
// months of jobs); everything else becomes a single job. "four_weeks" maps to
// the existing every4weeks recurrence frequency from Phase 1.
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

  const [quoteRow] = await db
    .select({ quote: quotes, hourlyRateCents: serviceLocations.hourlyRateCents })
    .from(quotes)
    .leftJoin(serviceLocations, and(eq(quotes.serviceLocationId, serviceLocations.id), eq(serviceLocations.companyId, admin.companyId)))
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId)))
    .limit(1);

  if (!quoteRow) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const { quote, hourlyRateCents } = quoteRow;
  if (quote.status !== "accepted" && !parsed.data.forceJob) {
    return NextResponse.json({ error: "Only accepted quotes can be converted" }, { status: 400 });
  }
  const isBookingOverride = quote.status !== "accepted";
  if (isBookingOverride && !parsed.data.overrideReason) {
    return NextResponse.json({ error: "A reason is required when scheduling without customer acceptance." }, { status: 400 });
  }
  const serviceType = parsed.data.serviceType ?? (quote.acceptedServiceType as ServiceType | null) ?? (quote.requestedServiceType as ServiceType | null);
  if (!serviceType) {
    return NextResponse.json({ error: "Choose a service to schedule." }, { status: 400 });
  }

  const { startDate, employeeIds } = parsed.data;
  const recurrenceFrequency = RECURRING_TYPES[serviceType];
  const allTierPricing = quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null;
  const selectedBreakdown = allTierPricing?.[serviceType];
  if (!selectedBreakdown) {
    return NextResponse.json({ error: "The selected service was not priced on this quote." }, { status: 400 });
  }
  const pricedBreakdown = selectedBreakdown;

  // Use this tier's final matrix price, rather than room weights or the
  // original requested tier. This is especially important for recurring
  // options, whose discounted price defines their job-ticket hours.
  const estimatedDurationMinutes = estimateDurationMinutesFromPrice(pricedBreakdown.finalCents, hourlyRateCents);

  // Scheduling with an office-recorded approval is still an accepted sale. Keep
  // the absence of a customer signature in the audit trail, but move the quote
  // into Accepted so quote lists, reports, and customer history match the work
  // that was booked.
  async function recordInternalAcceptance() {
    if (!isBookingOverride) return;

    await db
      .update(quotes)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedServiceType: serviceType,
        acceptedRecurringServiceType: recurrenceFrequency ? serviceType : null,
        totalCents: pricedBreakdown.finalCents,
      })
      .where(and(eq(quotes.id, quote.id), eq(quotes.companyId, admin.companyId)));

    await syncToGhl(admin.companyId, { type: "quote.accepted", customerId: quote.customerId });
  }

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
        priceCents: pricedBreakdown.finalCents,
        estimatedDurationMinutes,
        defaultEmployeeIds: employeeIds ?? [],
        isActive: true,
      })
      .returning();

    const generation = await generateJobsForSeries(series.id);

    if (isBookingOverride) {
      await db.insert(auditLog).values({
        companyId: admin.companyId,
        userId: admin.id,
        action: "quote.booked_without_acceptance",
        entityType: "quote",
        entityId: quote.id,
        after: { reason: parsed.data.overrideReason, serviceType, seriesId: series.id, startDate },
      });
    }
    await recordInternalAcceptance();

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
      priceCents: pricedBreakdown.finalCents,
    })
    .returning();

  if (isBookingOverride) {
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "quote.booked_without_acceptance",
      entityType: "quote",
      entityId: quote.id,
      after: { reason: parsed.data.overrideReason, serviceType, jobId: job.id, startDate },
    });
  }
  await recordInternalAcceptance();

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
