import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, customerLocations, invoices, jobAssignments, jobs, quotes, recurringSeries, users } from "@/db/schema";
import { and, eq, asc, desc, sql } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { resolveCustomerServiceArea } from "@/lib/service-area";
import { isFieldEligible } from "@/lib/auth/field-staff";

const updateCustomerSchema = z.object({
  status: z.enum(["lead", "quoted", "first_clean_booked", "client", "lost", "moved"]).optional(),
  clientType: z.enum(["residential", "commercial"]).optional(),
  customerNumber: z.string().trim().max(100).nullable().optional(),
  salutation: z.string().trim().max(40).nullable().optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  textMessagingAllowed: z.boolean().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  preferredCommunication: z.string().trim().max(100).nullable().optional(),
  preferredDay: z.string().trim().max(100).nullable().optional(),
  preferredTime: z.string().trim().max(100).nullable().optional(),
  preferredDays: z.array(z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"])).max(5).optional(),
  preferredCleanerId: z.string().uuid().nullable().optional(),
  preferredTimeOfDay: z.enum(["AM", "PM"]).nullable().optional(),
  paymentMethods: z.array(z.enum(["Cash", "Check", "Credit Card"])).max(3).optional(),
  generalNotes: z.string().trim().max(10000).nullable().optional(),
  doNotClean: z.string().trim().max(5000).nullable().optional(),
  petNotes: z.string().trim().max(5000).nullable().optional(),
  petHairRating: z.number().int().min(1).max(5).nullable().optional(),
  dogCount: z.number().int().min(0).max(50).nullable().optional(),
  catCount: z.number().int().min(0).max(50).nullable().optional(),
  dogNames: z.string().trim().max(500).nullable().optional(),
  catNames: z.string().trim().max(500).nullable().optional(),
  importantToCustomer: z.string().trim().max(5000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  homeDetails: z.record(z.string(), z.unknown()).optional(),
  mopHeadCount: z.number().int().min(0).nullable().optional(),
  ragCount: z.number().int().min(0).nullable().optional(),
  vacuumCount: z.number().int().min(0).nullable().optional(),
  isArchived: z.boolean().optional(),
  archivedReason: z.string().trim().max(500).nullable().optional(),
  locations: z.array(z.object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(100),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(50).nullable().optional(),
    zip: z.string().trim().max(20).nullable().optional(),
    county: z.string().trim().max(100).nullable().optional(),
    subdivision: z.string().trim().max(150).nullable().optional(),
    googlePlaceId: z.string().trim().max(200).nullable().optional(),
    accessInstructions: z.string().trim().max(5000).nullable().optional(),
    entryCode: z.string().trim().max(200).nullable().optional(),
    keyNumber: z.string().trim().max(200).nullable().optional(),
    garageCode: z.string().trim().max(200).nullable().optional(),
    gateCode: z.string().trim().max(200).nullable().optional(),
    alarmCode: z.string().trim().max(200).nullable().optional(),
    vacuumLocation: z.string().trim().max(500).nullable().optional(),
    mopHeadsNeeded: z.string().trim().max(500).nullable().optional(),
    trashBags: z.string().trim().max(500).nullable().optional(),
  })).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const admin = await requireAdmin();
  const { customerId } = await params;

  const [[customer], locationRows, customerJobs, customerJobAssignments, customerQuotes, customerRecurringSeries, customerInvoices, [{ lifetimeSpendCents }], serviceArea, auditLogs] = await Promise.all([
    db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, admin.companyId))).limit(1),
    db.select().from(customerLocations).where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId))).orderBy(asc(customerLocations.isPrimary), asc(customerLocations.label)),
    db.select({ id: jobs.id, type: jobs.type, status: jobs.status, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, priceCents: jobs.priceCents }).from(jobs).where(and(eq(jobs.customerId, customerId), eq(jobs.companyId, admin.companyId))).orderBy(desc(jobs.scheduledDate), desc(jobs.scheduledStartTime)),
    db.select({ jobId: jobAssignments.jobId, firstName: users.firstName, lastName: users.lastName, role: jobAssignments.role })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(and(eq(jobs.customerId, customerId), eq(jobs.companyId, admin.companyId))),
    db.select({
      id: quotes.id,
      status: quotes.status,
      totalCents: quotes.totalCents,
      requestedServiceType: quotes.requestedServiceType,
      acceptedServiceType: quotes.acceptedServiceType,
      createdAt: quotes.createdAt,
      createdByFirstName: users.firstName,
      createdByLastName: users.lastName,
    })
      .from(quotes)
      .leftJoin(users, eq(quotes.createdByUserId, users.id))
      .where(and(eq(quotes.customerId, customerId), eq(quotes.companyId, admin.companyId)))
      .orderBy(desc(quotes.createdAt)),
    db.select({ id: recurringSeries.id, frequency: recurringSeries.frequency, isActive: recurringSeries.isActive, startDate: recurringSeries.startDate, endDate: recurringSeries.endDate })
      .from(recurringSeries)
      .where(and(eq(recurringSeries.customerId, customerId), eq(recurringSeries.companyId, admin.companyId)))
      .orderBy(desc(recurringSeries.createdAt)),
    db.select({ id: invoices.id, status: invoices.status, method: invoices.method, totalCents: invoices.totalCents, amountPaidCents: invoices.amountPaidCents, tipCents: invoices.tipCents, createdAt: invoices.createdAt, paidAt: invoices.paidAt }).from(invoices).where(and(eq(invoices.customerId, customerId), eq(invoices.companyId, admin.companyId))).orderBy(desc(invoices.createdAt)),
    db.select({ lifetimeSpendCents: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)` }).from(invoices).where(and(eq(invoices.customerId, customerId), eq(invoices.companyId, admin.companyId))),
    resolveCustomerServiceArea({ companyId: admin.companyId, customerId }),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        before: auditLog.before,
        after: auditLog.after,
        createdAt: auditLog.createdAt,
        editorFirstName: users.firstName,
        editorLastName: users.lastName,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "customer"), eq(auditLog.entityId, customerId)))
      .orderBy(desc(auditLog.createdAt)),
  ]);

  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [creator] = customer.createdByUserId
    ? await db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, customer.createdByUserId)).limit(1)
    : [];
  const customerWithCreator = { ...customer, createdByName: creator ? `${creator.firstName} ${creator.lastName}` : null };

  let locations = locationRows;
  if (locations.length === 0 && customer.addressLine1) {
    locations = [{
      id: "", companyId: admin.companyId, customerId, label: "Primary home",
      addressLine1: customer.addressLine1, addressLine2: customer.addressLine2,
      city: customer.city, state: customer.state, zip: customer.zip,
      county: customer.county, subdivision: customer.subdivision, googlePlaceId: null,
      isPrimary: true, isActive: true, accessInstructions: customer.gateCodeOrKeyNotes,
      keyNumber: null, entryCode: null, garageCode: null, gateCode: null, alarmCode: null,
      vacuumLocation: null, mopHeadsNeeded: null, trashBags: null,
      createdAt: customer.createdAt, updatedAt: customer.updatedAt,
    }];
  }
  const assignedCleanerNamesByJob = new Map<string, string[]>();
  for (const assignment of customerJobAssignments.sort((a, b) => a.role === b.role ? 0 : a.role === "lead" ? -1 : 1)) {
    assignedCleanerNamesByJob.set(assignment.jobId, [...(assignedCleanerNamesByJob.get(assignment.jobId) ?? []), `${assignment.firstName} ${assignment.lastName}`]);
  }
  const quotesWithCreator = customerQuotes.map(({ createdByFirstName, createdByLastName, ...quote }) => ({
    ...quote,
    createdByName: createdByFirstName ? `${createdByFirstName} ${createdByLastName}` : null,
  }));
  return NextResponse.json({ customer: customerWithCreator, locations, jobs: customerJobs.map((job) => ({ ...job, assignedCleanerNames: assignedCleanerNamesByJob.get(job.id) ?? [] })), quotes: quotesWithCreator, recurringSeries: customerRecurringSeries, invoices: customerInvoices, auditLogs, serviceArea, lifetimeSpendCents: Number(lifetimeSpendCents) });
}

/** PATCH /api/customers/[customerId] — status changes only for now (no full Customers
 * screen yet). Firing this to 'lost'/'moved' triggers the corresponding GHL sync, per
 * PLAN.md §6's "Customer -> lost/moved" transition. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const admin = await requireAdmin();
  const { customerId } = await params;
  const body = await req.json();
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  if (parsed.data.preferredCleanerId) {
    const [cleaner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, parsed.data.preferredCleanerId), eq(users.companyId, admin.companyId), isFieldEligible, eq(users.isActive, true)))
      .limit(1);
    if (!cleaner) return NextResponse.json({ error: "Preferred cleaner must be an active employee in this company." }, { status: 400 });
  }

  const { locations, ...customerFields } = parsed.data;

  // Archive/restore is a distinct workflow action, not a generic profile edit — detect it as
  // "the only field(s) present are archive-related" so it gets its own audit action name and
  // skips the GHL sync below (no GhlSyncEvent type maps to "archived", and this is an internal
  // CleanOps workflow state, not a CRM-relevant transition).
  const customerFieldKeys = Object.keys(customerFields);
  const isArchiveOnly = customerFieldKeys.length > 0 && customerFieldKeys.every((key) => key === "isArchived" || key === "archivedReason");

  // Server sets the archive timestamp — never trust a client-supplied value. Restoring clears
  // both the timestamp and the reason so a future archive doesn't inherit a stale reason.
  if (parsed.data.isArchived === true) {
    (customerFields as typeof customerFields & { archivedAt?: Date }).archivedAt = new Date();
  } else if (parsed.data.isArchived === false) {
    (customerFields as typeof customerFields & { archivedAt?: Date | null }).archivedAt = null;
    customerFields.archivedReason = null;
  }

  const [beforeLocations] = await Promise.all([db.select().from(customerLocations).where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId)))]);

  await db.transaction(async (tx) => {
    await tx.update(customers).set({ ...customerFields, updatedAt: new Date() }).where(eq(customers.id, customerId));

    // All locations are saved together, not just the one being actively
    // edited — otherwise switching to a newly-added location and saving would
    // silently drop any other location that only ever existed as the
    // synthetic single-location fallback below (never yet a real row).
    if (locations) {
      for (const loc of locations) {
        const { id: locationId, ...locationFields } = loc;
        if (locationId) {
          await tx.update(customerLocations).set({ ...locationFields, updatedAt: new Date() }).where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId)));
        } else {
          await tx.insert(customerLocations).values({ companyId: admin.companyId, customerId, ...locationFields });
        }
      }
    }
  });

  const action = isArchiveOnly
    ? parsed.data.isArchived === true
      ? "customer.archived"
      : "customer.restored"
    : "customer.updated";

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action,
    entityType: "customer",
    entityId: customerId,
    before: { customer, locations: beforeLocations },
    after: { ...customer, ...customerFields, locations: locations ?? beforeLocations },
  });

  if (!isArchiveOnly) {
    if (parsed.data.status === "lost") {
      await syncToGhl(admin.companyId, { type: "customer.lost", customerId });
    } else if (parsed.data.status === "moved") {
      await syncToGhl(admin.companyId, { type: "customer.moved", customerId });
    }

    const [updatedCustomer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.companyId, admin.companyId)))
      .limit(1);

    if (updatedCustomer) {
      await syncToGhl(admin.companyId, {
        type: "customer.updated",
        customerId,
        firstName: updatedCustomer.firstName,
        lastName: updatedCustomer.lastName,
        email: updatedCustomer.email,
        phone: updatedCustomer.phone,
        address1: updatedCustomer.addressLine1,
        city: updatedCustomer.city,
        state: updatedCustomer.state,
        postalCode: updatedCustomer.zip,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
