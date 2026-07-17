import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, quotes, customers, companies, roomTypes, serviceLocations, travelZones, gmailConnections, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { PricingBreakdown, ServiceType } from "@/lib/pricing/calculate";
import { syncToGhl } from "@/lib/ghl/sync";
import { refreshGoogleAccessToken, sendGmailMessage } from "@/lib/gmail/client";

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
    await notifyQuoteViewed(row.quote.companyId, row.quote.id, row.customerFirstName, row.customerLastName, row.locationName, _req.url);
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
    travelZoneName: row.travelZoneName,
    allTierPricing: tiersWithNames,
    quoteTemplate: settings.quoteTemplate ?? null,
  });
}

async function notifyQuoteViewed(
  companyId: string,
  quoteId: string,
  firstName: string,
  lastName: string,
  locationName: string | null,
  requestUrl: string
) {
  const [gmailConnection] = await db.select().from(gmailConnections).where(eq(gmailConnections.companyId, companyId)).limit(1);
  if (!gmailConnection) return;

  const admins = await db
    .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "admin")));

  const recipientEmails = admins.map((admin) => admin.email).filter(Boolean);
  if (recipientEmails.length === 0) return;

  const accessToken = await refreshGoogleAccessToken(gmailConnection.refreshToken);
  const customerName = `${firstName} ${lastName}`.trim();
  const quoteUrl = new URL(`/quotes/${quoteId}`, requestUrl).toString();
  const subject = `Quote viewed in CleanOps`;
  const text = [
    `A quote was viewed in CleanOps.`,
    `Customer: ${customerName}`,
    `Location: ${locationName ?? "Service area not set"}`,
    `Quote ID: ${quoteId}`,
    `Admin view: ${quoteUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10211f">
      <p>A quote was viewed in CleanOps.</p>
      <ul>
        <li><strong>Customer:</strong> ${customerName}</li>
        <li><strong>Location:</strong> ${locationName ?? "Service area not set"}</li>
        <li><strong>Quote ID:</strong> ${quoteId}</li>
      </ul>
      <p><a href="${quoteUrl}">Open the quote in CleanOps</a></p>
    </div>
  `;

  await sendGmailMessage({
    accessToken: accessToken.access_token,
    fromEmail: gmailConnection.senderEmail,
    to: recipientEmails.join(", "),
    subject,
    text,
    html,
    replyTo: gmailConnection.senderEmail,
  });

  await db.update(gmailConnections).set({ lastUsedAt: new Date() }).where(eq(gmailConnections.companyId, companyId));
}
