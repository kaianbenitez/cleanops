import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { calendarEventAssignments, calendarEvents, companies, employeePto, employeeServiceLocations, jobAssignments, jobs, quotes, serviceLocations, users } from "@/db/schema";
import { isFieldEligible } from "@/lib/auth/field-staff";
import { estimateDurationMinutesFromPrice, SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { getSchedulingRecommendations, parseSchedulingSettings } from "@/lib/scheduling/recommendations";

const requestSchema = z.object({ quoteId: z.string().uuid(), serviceType: z.enum(SERVICE_TYPES).optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), preferredWindow: z.enum(["morning", "afternoon"]).nullable().optional() });
function today() { return new Date().toISOString().slice(0, 10); }
function plusDays(date: string, days: number) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

/** Admin-only and quote-scoped: the browser supplies no price, branch,
 * customer, or employee availability data. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const [quoteRows, companyRows] = await Promise.all([
    db.select({ quote: quotes, hourlyRateCents: serviceLocations.hourlyRateCents }).from(quotes).innerJoin(serviceLocations, and(eq(quotes.serviceLocationId, serviceLocations.id), eq(serviceLocations.companyId, admin.companyId))).where(and(eq(quotes.id, input.quoteId), eq(quotes.companyId, admin.companyId))).limit(1),
    db.select({ settings: companies.settings }).from(companies).where(eq(companies.id, admin.companyId)).limit(1),
  ]);
  const quoteRow = quoteRows[0];
  const company = companyRows[0];
  if (!quoteRow) return NextResponse.json({ error: "Quote with a saved service branch was not found." }, { status: 404 });
  const serviceType = input.serviceType ?? quoteRow.quote.acceptedServiceType ?? quoteRow.quote.requestedServiceType;
  const pricing = (quoteRow.quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null)?.[serviceType as ServiceType];
  if (!serviceType || !pricing) return NextResponse.json({ error: "Choose a service that was priced on this quote." }, { status: 400 });
  const startDate = input.startDate ?? today(); const endDate = input.endDate ?? plusDays(startDate, 28);
  if (endDate < startDate) return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
  const [staff, eligibility, pto, jobRows, jobAssignmentRows, eventRows, eventAssignmentRows] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, isActive: users.isActive, isFieldStaff: users.isFieldStaff }).from(users).where(and(eq(users.companyId, admin.companyId), eq(users.isActive, true), isFieldEligible)),
    db.select({ userId: employeeServiceLocations.userId, serviceLocationId: employeeServiceLocations.serviceLocationId }).from(employeeServiceLocations).where(eq(employeeServiceLocations.companyId, admin.companyId)),
    db.select().from(employeePto).where(and(eq(employeePto.companyId, admin.companyId), lte(employeePto.startDate, endDate), gte(employeePto.endDate, startDate))),
    db.select({ id: jobs.id, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, status: jobs.status }).from(jobs).where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, startDate), lte(jobs.scheduledDate, endDate))),
    db.select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId }).from(jobAssignments).innerJoin(jobs, eq(jobAssignments.jobId, jobs.id)).where(and(eq(jobs.companyId, admin.companyId), gte(jobs.scheduledDate, startDate), lte(jobs.scheduledDate, endDate))),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.companyId, admin.companyId), gte(calendarEvents.scheduledDate, startDate), lte(calendarEvents.scheduledDate, endDate))),
    db.select({ eventId: calendarEventAssignments.eventId, userId: calendarEventAssignments.userId }).from(calendarEventAssignments).innerJoin(calendarEvents, eq(calendarEventAssignments.eventId, calendarEvents.id)).where(and(eq(calendarEvents.companyId, admin.companyId), gte(calendarEvents.scheduledDate, startDate), lte(calendarEvents.scheduledDate, endDate))),
  ]);
  const idsByUser = new Map<string, string[]>(); eligibility.forEach((row) => idsByUser.set(row.userId, [...(idsByUser.get(row.userId) ?? []), row.serviceLocationId]));
  const assignmentsByJob = new Map<string, string[]>(); jobAssignmentRows.forEach((row) => assignmentsByJob.set(row.jobId, [...(assignmentsByJob.get(row.jobId) ?? []), row.userId]));
  const assignmentsByEvent = new Map<string, string[]>(); eventAssignmentRows.forEach((row) => assignmentsByEvent.set(row.eventId, [...(assignmentsByEvent.get(row.eventId) ?? []), row.userId]));
  const totalJthMinutes = estimateDurationMinutesFromPrice(pricing.finalCents, quoteRow.hourlyRateCents);
  const recommendations = getSchedulingRecommendations({ startDate, endDate, serviceLocationId: quoteRow.quote.serviceLocationId!, serviceType, totalJthMinutes, preferredWindow: input.preferredWindow, employees: staff.map((employee) => ({
    ...employee,
    // isFieldEligible includes every employee role; normalize that for the recommendation engine.
    isFieldStaff: employee.role === "employee" || employee.isFieldStaff,
    serviceLocationIds: idsByUser.get(employee.id) ?? [],
  })), pto, jobs: jobRows.map((job) => ({ ...job, assignedUserIds: assignmentsByJob.get(job.id) ?? [] })), calendarEvents: eventRows.map((event) => ({ ...event, attendeeUserIds: assignmentsByEvent.get(event.id) ?? [] })), settings: parseSchedulingSettings((company?.settings as Record<string, unknown> | null) ?? {}) });
  return NextResponse.json({ quoteId: quoteRow.quote.id, serviceType, serviceLocationId: quoteRow.quote.serviceLocationId, totalJthMinutes, eligibleEmployees: staff.filter((employee) => (idsByUser.get(employee.id) ?? []).includes(quoteRow.quote.serviceLocationId!)).map(({ id, firstName, lastName }) => ({ id, firstName, lastName })), recommendations });
}
