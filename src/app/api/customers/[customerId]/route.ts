import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, customerLocations, invoices, jobs, users } from "@/db/schema";
import { and, eq, asc, desc } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { resolveCustomerServiceArea } from "@/lib/service-area";

const updateCustomerSchema = z.object({
  status: z.enum(["lead", "quoted", "first_clean_booked", "client", "lost", "moved"]).optional(),
  customerNumber: z.string().trim().max(100).nullable().optional(),
  salutation: z.string().trim().max(40).nullable().optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  textMessagingAllowed: z.boolean().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  preferredCommunication: z.string().trim().max(100).nullable().optional(),
  preferredDay: z.string().trim().max(100).nullable().optional(),
  preferredTime: z.string().trim().max(100).nullable().optional(),
  serviceType: z.string().trim().max(100).nullable().optional(),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
  importantToCustomer: z.string().trim().max(5000).nullable().optional(),
  doNotClean: z.string().trim().max(5000).nullable().optional(),
  petNotes: z.string().trim().max(5000).nullable().optional(),
  operationalNotes: z.string().trim().max(10000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  homeDetails: z.record(z.string(), z.unknown()).optional(),
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
  const [customer] = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.companyId, admin.companyId))).limit(1);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  let locations = await db.select().from(customerLocations).where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId))).orderBy(asc(customerLocations.isPrimary), asc(customerLocations.label));
  if (locations.length === 0 && customer.addressLine1) {
    locations = [{
      id: "", companyId: admin.companyId, customerId, label: "Primary home",
      addressLine1: customer.addressLine1, addressLine2: customer.addressLine2,
      city: customer.city, state: customer.state, zip: customer.zip,
      county: customer.county, subdivision: customer.subdivision, googlePlaceId: null,
      isPrimary: true, isActive: true, accessInstructions: customer.gateCodeOrKeyNotes,
      keyNumber: null, garageCode: null, gateCode: null, alarmCode: null,
      vacuumLocation: null, mopHeadsNeeded: null, trashBags: null,
      createdAt: customer.createdAt, updatedAt: customer.updatedAt,
    }];
  }
  const customerJobs = await db.select({ id: jobs.id, type: jobs.type, status: jobs.status, scheduledDate: jobs.scheduledDate, scheduledStartTime: jobs.scheduledStartTime, estimatedDurationMinutes: jobs.estimatedDurationMinutes, priceCents: jobs.priceCents }).from(jobs).where(and(eq(jobs.customerId, customerId), eq(jobs.companyId, admin.companyId))).orderBy(desc(jobs.scheduledDate), desc(jobs.scheduledStartTime));
  const customerInvoices = await db.select({ id: invoices.id, status: invoices.status, method: invoices.method, totalCents: invoices.totalCents, amountPaidCents: invoices.amountPaidCents, tipCents: invoices.tipCents, createdAt: invoices.createdAt, paidAt: invoices.paidAt }).from(invoices).where(and(eq(invoices.customerId, customerId), eq(invoices.companyId, admin.companyId))).orderBy(desc(invoices.createdAt));
  const serviceArea = await resolveCustomerServiceArea({ companyId: admin.companyId, customerId });
  const auditLogs = await db
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
    .orderBy(desc(auditLog.createdAt));
  return NextResponse.json({ customer, locations, jobs: customerJobs, invoices: customerInvoices, auditLogs, serviceArea });
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

  const { locations, ...customerFields } = parsed.data;
  const [beforeLocations] = await Promise.all([db.select().from(customerLocations).where(and(eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId)))]);
  await db.update(customers).set({ ...customerFields, updatedAt: new Date() }).where(eq(customers.id, customerId));

  // All locations are saved together, not just the one being actively
  // edited — otherwise switching to a newly-added location and saving would
  // silently drop any other location that only ever existed as the
  // synthetic single-location fallback below (never yet a real row).
  if (locations) {
    for (const loc of locations) {
      const { id: locationId, ...locationFields } = loc;
      if (locationId) {
        await db.update(customerLocations).set({ ...locationFields, updatedAt: new Date() }).where(and(eq(customerLocations.id, locationId), eq(customerLocations.customerId, customerId), eq(customerLocations.companyId, admin.companyId)));
      } else {
        await db.insert(customerLocations).values({ companyId: admin.companyId, customerId, ...locationFields });
      }
    }
  }

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "customer.updated",
    entityType: "customer",
    entityId: customerId,
    before: { customer, locations: beforeLocations },
    after: { ...customer, ...customerFields, locations: locations ?? beforeLocations },
  });

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

  return NextResponse.json({ ok: true });
}
