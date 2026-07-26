import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quotes, customers, companies, roomTypes, serviceLocations, travelZones } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PricingBreakdown, ServiceType } from "@/lib/pricing/calculate";

/** GET /api/public/quotes/[token] — unauthenticated and read-only.
 * Returns pricing for EVERY service tier (not just one) so the customer can compare and
 * choose, matching the company's real proposal — see DECISIONS.md 2026-07-14. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [row] = await db
    .select({
      quote: quotes,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerAddressLine1: customers.addressLine1,
      customerCity: customers.city,
      customerState: customers.state,
      customerZip: customers.zip,
      companyName: companies.name,
      companySettings: companies.settings,
      locationName: serviceLocations.name,
      hourlyRateCents: serviceLocations.hourlyRateCents,
      travelZoneName: travelZones.name,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .leftJoin(serviceLocations, eq(quotes.serviceLocationId, serviceLocations.id))
    .leftJoin(travelZones, eq(quotes.travelZoneId, travelZones.id))
    .where(eq(quotes.publicToken, token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const roomTypeRows = await db.select().from(roomTypes).where(eq(roomTypes.companyId, row.quote.companyId));
  const roomTypeNames = new Map(roomTypeRows.map((r) => [r.id, r.name]));

  const allTierPricing = (row.quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null) ?? null;
  const tiersWithNames = allTierPricing
    ? Object.fromEntries(
        Object.entries(allTierPricing).map(([serviceType, breakdown]) => [
          serviceType,
          {
            roomLines: breakdown.roomLines.map((l) => ({
              roomTypeName: roomTypeNames.get(l.roomTypeId) ?? "Room",
              count: l.count,
            })),
            finalCents: breakdown.finalCents,
          },
        ])
      )
    : null;

  const settings = (row.companySettings as {
    quoteTemplate?: {
      introLetter?: string;
      terms?: string;
      ownerName?: string;
      ownerTitle?: string;
      logoUrl?: string | null;
      reviewUrl?: string | null;
      beforePhotoUrl?: string | null;
      afterPhotoUrl?: string | null;
      insuranceUrl?: string | null;
      w9Url?: string | null;
      preferredDatePrompt?: string;
      contactPhone?: string | null;
    };
    branding?: { phone?: string | null; logoUrl?: string | null; brandColor?: string | null; reviewUrl?: string | null };
  }) ?? {};

  return NextResponse.json({
    quote: {
      id: row.quote.id, status: row.quote.status, totalCents: row.quote.totalCents,
      requestedServiceType: row.quote.requestedServiceType, acceptedServiceType: row.quote.acceptedServiceType,
      notesToCustomer: row.quote.notesToCustomer, validUntil: row.quote.validUntil,
      signatureName: row.quote.signatureName,
    },
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    customerAddressLine1: row.customerAddressLine1,
    customerCity: row.customerCity,
    customerState: row.customerState,
    customerZip: row.customerZip,
    companyName: row.companyName,
    companyPhone: settings.branding?.phone ?? null,
    companyLogoUrl: settings.quoteTemplate?.logoUrl ?? settings.branding?.logoUrl ?? null,
    companyBrandColor: settings.branding?.brandColor ?? null,
    companyReviewUrl: settings.quoteTemplate?.reviewUrl ?? settings.branding?.reviewUrl ?? null,
    locationName: row.locationName,
    travelZoneName: row.travelZoneName,
    allTierPricing: tiersWithNames,
    quoteTemplate: settings.quoteTemplate ?? null,
  });
}
