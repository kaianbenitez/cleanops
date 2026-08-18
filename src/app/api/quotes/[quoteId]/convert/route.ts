import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, calendarEventAssignments, calendarEvents, companies, customers, employeePto, employeeServiceLocations, jobAssignments, jobs, quotes, recurringSeries, serviceLocations, users } from "@/db/schema";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { estimateDurationMinutesFromPrice, SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { getSchedulingRecommendations, parseSchedulingSettings } from "@/lib/scheduling/recommendations";
import { generateJobsForSeries } from "@/lib/scheduling/generate-jobs";
import { syncToGhl } from "@/lib/ghl/sync";

const bookingSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arrivalWindowStartTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  arrivalWindowEndTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  employeeIds: z.array(z.string().uuid()).min(1).max(3),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  customerAgreedByPhone: z.boolean().optional(),
  agreementNote: z.string().trim().min(1).max(1000).optional(),
});
const RECURRING_TYPES: Record<string, "weekly" | "biweekly" | "every4weeks"> = { weekly: "weekly", biweekly: "biweekly", four_weeks: "every4weeks" };
const ONE_OFF_JOB_TYPE: Record<string, "first_clean" | "deep_clean" | "move_out"> = { first_time: "first_clean", deep: "deep_clean", supreme_deep: "deep_clean", move_in_out: "move_out" };

async function existingBooking(companyId: string, quoteId: string) {
  const [job] = await db.select({ id: jobs.id, scheduledDate: jobs.scheduledDate }).from(jobs).where(and(eq(jobs.companyId, companyId), eq(jobs.quoteId, quoteId))).limit(1);
  if (job) return { job, redirectTo: `/calendar?view=staff&day=${job.scheduledDate}&highlightJob=${job.id}` };
  const [series] = await db.select({ id: recurringSeries.id, startDate: recurringSeries.startDate }).from(recurringSeries).where(and(eq(recurringSeries.companyId, companyId), eq(recurringSeries.sourceQuoteId, quoteId))).limit(1);
  return series ? { series, redirectTo: `/calendar?view=staff&day=${series.startDate}&highlightSeries=${series.id}` } : null;
}

/** Complete quote booking. The endpoint retains its old URL for compatibility,
 * but date + arrival window + field-eligible crew are now mandatory. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ quoteId: string }> }) {
  const admin = await requireAdmin(); const { quoteId } = await params;
  const parsed = bookingSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (new Set(data.employeeIds).size !== data.employeeIds.length) return NextResponse.json({ error: "Choose each cleaner only once." }, { status: 400 });
  const [quoteRows, companyRows] = await Promise.all([
    db.select({ quote: quotes, hourlyRateCents: serviceLocations.hourlyRateCents }).from(quotes).innerJoin(serviceLocations, and(eq(quotes.serviceLocationId, serviceLocations.id), eq(serviceLocations.companyId, admin.companyId))).where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId))).limit(1),
    db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, admin.companyId)).limit(1),
  ]);
  const quoteRow = quoteRows[0];
  const company = companyRows[0];
  if (!quoteRow) return NextResponse.json({ error: "Quote with a saved service branch was not found." }, { status: 404 });
  if (quoteRow.quote.bookedAt) return NextResponse.json({ error: "This quote is already booked.", ...(await existingBooking(admin.companyId, quoteId)) }, { status: 409 });
  if (quoteRow.quote.status !== "accepted" && (!data.customerAgreedByPhone || !data.agreementNote)) return NextResponse.json({ error: "Record that the customer agreed by phone before booking an unaccepted quote." }, { status: 400 });
  const serviceType = data.serviceType ?? quoteRow.quote.acceptedServiceType ?? quoteRow.quote.requestedServiceType;
  const pricing = (quoteRow.quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null)?.[serviceType as ServiceType];
  if (!serviceType || !pricing) return NextResponse.json({ error: "The selected service was not priced on this quote." }, { status: 400 });
  const settings = parseSchedulingSettings((company?.settings as Record<string, unknown> | null) ?? {});
  if (!settings.bookingWindows.some((window) => window.startTime.slice(0, 5) === data.arrivalWindowStartTime.slice(0, 5) && window.endTime.slice(0, 5) === data.arrivalWindowEndTime.slice(0, 5))) return NextResponse.json({ error: "Choose one of the configured arrival windows." }, { status: 400 });
  const [staff, eligibility, pto, jobRows, assignmentRows, eventRows, eventAssignmentRows] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive, isFieldStaff: users.isFieldStaff }).from(users).where(and(eq(users.companyId, admin.companyId), inArray(users.id, data.employeeIds), eq(users.isActive, true), isFieldEligible)),
    db.select({ userId: employeeServiceLocations.userId, serviceLocationId: employeeServiceLocations.serviceLocationId }).from(employeeServiceLocations).where(and(eq(employeeServiceLocations.companyId, admin.companyId), inArray(employeeServiceLocations.userId, data.employeeIds))),
    db.select().from(employeePto).where(and(eq(employeePto.companyId, admin.companyId), lte(employeePto.startDate, data.startDate), gte(employeePto.endDate, data.startDate))),
    db.select({ id: jobs.id, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, status: jobs.status }).from(jobs).where(and(eq(jobs.companyId, admin.companyId), eq(jobs.scheduledDate, data.startDate))),
    db.select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId }).from(jobAssignments).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).where(and(eq(jobs.companyId, admin.companyId), eq(jobs.scheduledDate, data.startDate))),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.companyId, admin.companyId), eq(calendarEvents.scheduledDate, data.startDate))),
    db.select({ eventId: calendarEventAssignments.eventId, userId: calendarEventAssignments.userId }).from(calendarEventAssignments).innerJoin(calendarEvents, eq(calendarEventAssignments.eventId, calendarEvents.id)).where(and(eq(calendarEvents.companyId, admin.companyId), eq(calendarEvents.scheduledDate, data.startDate))),
  ]);
  if (staff.length !== data.employeeIds.length) return NextResponse.json({ error: "Every cleaner must be active field staff in this company." }, { status: 400 });
  const idsByUser = new Map<string, string[]>(); eligibility.forEach((row) => idsByUser.set(row.userId, [...(idsByUser.get(row.userId) ?? []), row.serviceLocationId]));
  const assignmentsByJob = new Map<string, string[]>(); assignmentRows.forEach((row) => assignmentsByJob.set(row.jobId, [...(assignmentsByJob.get(row.jobId) ?? []), row.userId]));
  const assignmentsByEvent = new Map<string, string[]>(); eventAssignmentRows.forEach((row) => assignmentsByEvent.set(row.eventId, [...(assignmentsByEvent.get(row.eventId) ?? []), row.userId]));
  const estimatedDurationMinutes = estimateDurationMinutesFromPrice(pricing.finalCents, quoteRow.hourlyRateCents);
  // Passing only the selected crew turns the pure engine into the confirmation
  // validator for both a recommended and a manual booking choice.
  const valid = getSchedulingRecommendations({ startDate: data.startDate, endDate: data.startDate, serviceLocationId: quoteRow.quote.serviceLocationId!, serviceType, totalJthMinutes: estimatedDurationMinutes, employees: staff.map((employee) => ({ ...employee, serviceLocationIds: idsByUser.get(employee.id) ?? [] })), pto, jobs: jobRows.map((job) => ({ ...job, assignedUserIds: assignmentsByJob.get(job.id) ?? [] })), calendarEvents: eventRows.map((event) => ({ ...event, attendeeUserIds: assignmentsByEvent.get(event.id) ?? [] })), settings }).find((item) => item.arrivalWindowStartTime.slice(0, 5) === data.arrivalWindowStartTime.slice(0, 5) && item.arrivalWindowEndTime.slice(0, 5) === data.arrivalWindowEndTime.slice(0, 5) && item.employeeIds.length === data.employeeIds.length && item.employeeIds.every((id) => data.employeeIds.includes(id)));
  if (!valid) return NextResponse.json({ error: "That date, arrival window, and crew no longer fit. Check availability again." }, { status: 409 });
  const recurringFrequency = RECURRING_TYPES[serviceType]; const jobType = ONE_OFF_JOB_TYPE[serviceType] ?? "one_time";
  const discountCents = Math.max(0, pricing.rawTotalCents - pricing.finalCents);
  let result: { job?: { id: string; scheduledDate: string }; series?: { id: string; startDate: string } } | undefined;
  try {
    await db.transaction(async (tx) => {
      // Atomic quote claim prevents two coordinators from creating duplicate work.
      const [claimed] = await tx.update(quotes).set({ bookedAt: new Date(), ...(quoteRow.quote.status === "accepted" ? {} : { status: "accepted", acceptedAt: new Date(), acceptedServiceType: serviceType, acceptedRecurringServiceType: recurringFrequency ? serviceType : null, totalCents: pricing.finalCents }) }).where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId), isNull(quotes.bookedAt))).returning({ id: quotes.id });
      if (!claimed) throw new Error("QUOTE_ALREADY_BOOKED");
      if (data.customerAgreedByPhone) await tx.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "quote.customer_agreed_by_phone", entityType: "quote", entityId: quoteId, after: { note: data.agreementNote, serviceType } });
      if (recurringFrequency) {
        const [series] = await tx.insert(recurringSeries).values({ companyId: admin.companyId, customerId: quoteRow.quote.customerId, sourceQuoteId: quoteId, serviceLocationId: quoteRow.quote.serviceLocationId, frequency: recurringFrequency, dayOfWeek: new Date(`${data.startDate}T00:00:00.000Z`).getUTCDay(), startDate: data.startDate, priceCents: pricing.finalCents, discountCents, estimatedDurationMinutes, defaultEmployeeIds: data.employeeIds, defaultScheduledStartTime: data.arrivalWindowStartTime, defaultArrivalWindowEndTime: data.arrivalWindowEndTime, isActive: true }).returning({ id: recurringSeries.id, startDate: recurringSeries.startDate });
        await tx.update(customers).set({ status: "client", recurrence: recurringFrequency }).where(and(eq(customers.id, quoteRow.quote.customerId), eq(customers.companyId, admin.companyId)));
        result = { series };
      } else {
        const [job] = await tx.insert(jobs).values({ companyId: admin.companyId, customerId: quoteRow.quote.customerId, quoteId, type: jobType, status: "scheduled", scheduledDate: data.startDate, scheduledStartTime: data.arrivalWindowStartTime, arrivalWindowEndTime: data.arrivalWindowEndTime, estimatedDurationMinutes, priceCents: pricing.finalCents, discountCents }).returning({ id: jobs.id, scheduledDate: jobs.scheduledDate });
        await tx.insert(jobAssignments).values(data.employeeIds.map((userId, index) => ({ jobId: job.id, userId, role: index === 0 ? "lead" as const : "helper" as const })));
        if (jobType === "first_clean") await tx.update(customers).set({ status: "first_clean_booked" }).where(and(eq(customers.id, quoteRow.quote.customerId), eq(customers.companyId, admin.companyId)));
        result = { job };
      }
      await tx.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "quote.booked", entityType: "quote", entityId: quoteId, after: { serviceType, ...data, estimatedDurationMinutes, result } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_ALREADY_BOOKED") return NextResponse.json({ error: "This quote is already booked.", ...(await existingBooking(admin.companyId, quoteId)) }, { status: 409 });
    throw error;
  }
  const booked = result as { job?: { id: string; scheduledDate: string }; series?: { id: string; startDate: string } } | undefined;
  if (!booked) throw new Error("Booking transaction did not return a result.");
  if (booked.series) { await generateJobsForSeries(booked.series.id); await syncToGhl(admin.companyId, { type: "customer.became_client", customerId: quoteRow.quote.customerId, recurrence: recurringFrequency! }); }
  if (booked.job && jobType === "first_clean") await syncToGhl(admin.companyId, { type: "first_clean.scheduled", customerId: quoteRow.quote.customerId, scheduledDate: data.startDate });
  if (quoteRow.quote.status !== "accepted") await syncToGhl(admin.companyId, { type: "quote.accepted", customerId: quoteRow.quote.customerId });
  const redirectTo = booked.job ? `/calendar?view=staff&day=${booked.job.scheduledDate}&highlightJob=${booked.job.id}` : `/calendar?view=staff&day=${booked.series?.startDate}&highlightSeries=${booked.series?.id}`;
  return NextResponse.json({ ...booked, redirectTo, recommendation: valid }, { status: 201 });
}
