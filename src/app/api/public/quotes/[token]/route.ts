import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, quotes, customers, companies, roomTypes, serviceLocations, travelZones } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PricingBreakdown, ServiceType } from "@/lib/pricing/calculate";
import { syncToGhl } from "@/lib/ghl/sync";

/** GET /api/public/quotes/[token] — unauthenticated. Marks the quote viewed on first load.
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
      customerCity: customers.city,
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

  const viewedAt = new Date();
  if (!row.quote.viewedAt) {
    await db.update(quotes).set({ viewedAt, status: "viewed" }).where(eq(quotes.id, row.quote.id));
    await syncToGhl(row.quote.companyId, { type: "quote.viewed", customerId: row.quote.customerId, quoteUrl: `${new URL(`/quote/${token}`, _req.url).toString()}`, viewedAt: viewedAt.toISOString() });
  }
  await db.insert(auditLog).values({
    companyId: row.quote.companyId,
    action: "quote.viewed",
    entityType: "quote",
    entityId: row.quote.id,
    before: null,
    after: { token, viewedAt: viewedAt.toISOString() },
  });

  const roomTypeRows = await db.select().from(roomTypes).where(eq(roomTypes.companyId, row.quote.companyId));
  const roomTypeNames = new Map(roomTypeRows.map((r) => [r.id, r.name]));

  const allTierPricing = (row.quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null) ?? null;
  const tiersWithNames = allTierPricing
    ? Object.fromEntries(
        Object.entries(allTierPricing).map(([serviceType, breakdown]) => [
          serviceType,
          {
            ...breakdown,
            roomLines: breakdown.roomLines.map((l) => ({
              ...l,
              roomTypeName: roomTypeNames.get(l.roomTypeId) ?? "Room",
            })),
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
    quote: { ...row.quote, viewedAt: row.quote.viewedAt ?? new Date() },
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    customerCity: row.customerCity,
    companyName: row.companyName,
    companyPhone: settings.branding?.phone ?? null,
    companyLogoUrl: settings.quoteTemplate?.logoUrl ?? settings.branding?.logoUrl ?? null,
    companyBrandColor: settings.branding?.brandColor ?? null,
    companyReviewUrl: settings.quoteTemplate?.reviewUrl ?? settings.branding?.reviewUrl ?? null,
    locationName: row.locationName,
    hourlyRateCents: row.hourlyRateCents,
    travelZoneName: row.travelZoneName,
    allTierPricing: tiersWithNames,
    quoteTemplate: settings.quoteTemplate ?? null,
  });
}
