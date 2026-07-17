import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, quotes, customers, serviceLocations, travelZones } from "@/db/schema";
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
      locationName: serviceLocations.name,
      travelZoneName: travelZones.name,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(serviceLocations, eq(quotes.serviceLocationId, serviceLocations.id))
    .leftJoin(travelZones, eq(quotes.travelZoneId, travelZones.id))
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

  return NextResponse.json({
    quote: row.quote,
    customerId: row.customerId,
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    locationName: row.locationName,
    travelZoneName: row.travelZoneName,
    viewCount: Number(viewCountRow?.viewCount ?? 0),
    lastViewedAt: lastViewedRow?.lastViewedAt ?? null,
  });
}
