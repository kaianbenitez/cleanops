import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, quotes, customers, serviceLocations, travelZones, users } from "@/db/schema";
import { and, count, desc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  const admin = await requireAdmin();
  const { quoteId } = await params;

  const [row] = await db
    .select({
      quote: quotes,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerAddressLine1: customers.addressLine1,
      customerCity: customers.city,
      customerState: customers.state,
      customerZip: customers.zip,
      locationName: serviceLocations.name,
      hourlyRateCents: serviceLocations.hourlyRateCents,
      travelZoneName: travelZones.name,
      createdByFirstName: users.firstName,
      createdByLastName: users.lastName,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(serviceLocations, eq(quotes.serviceLocationId, serviceLocations.id))
    .leftJoin(travelZones, eq(quotes.travelZoneId, travelZones.id))
    .leftJoin(users, eq(quotes.createdByUserId, users.id))
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const [viewCountRow] = await db
    .select({ viewCount: count(auditLog.id) })
    .from(auditLog)
    .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "quote"), eq(auditLog.entityId, quoteId), eq(auditLog.action, "quote.viewed")))
    .limit(1);
  const [lastViewedRow] = await db
    .select({ lastViewedAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "quote"), eq(auditLog.entityId, quoteId), eq(auditLog.action, "quote.viewed")))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  const [bookingOverride] = await db
    .select({
      reason: auditLog.after,
      bookedAt: auditLog.createdAt,
      staffFirstName: users.firstName,
      staffLastName: users.lastName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.companyId, admin.companyId), eq(auditLog.entityType, "quote"), eq(auditLog.entityId, quoteId), eq(auditLog.action, "quote.booked_without_acceptance")))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  return NextResponse.json({
    quote: row.quote,
    customerId: row.customerId,
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    customerAddressLine1: row.customerAddressLine1,
    customerCity: row.customerCity,
    customerState: row.customerState,
    customerZip: row.customerZip,
    locationName: row.locationName,
    hourlyRateCents: row.hourlyRateCents,
    travelZoneName: row.travelZoneName,
    createdByName: [row.createdByFirstName, row.createdByLastName].filter(Boolean).join(" ") || null,
    viewCount: Number(viewCountRow?.viewCount ?? 0),
    lastViewedAt: lastViewedRow?.lastViewedAt ?? null,
    bookingOverride: bookingOverride
      ? {
          reason: (bookingOverride.reason as { reason?: string } | null)?.reason ?? "Reason not recorded",
          bookedAt: bookingOverride.bookedAt,
          staffName: [bookingOverride.staffFirstName, bookingOverride.staffLastName].filter(Boolean).join(" ") || null,
        }
      : null,
  });
}
