import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { quotes, customers } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { calculateAllTierPrices, SERVICE_TYPES } from "@/lib/pricing/calculate";

const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  serviceLocationId: z.string().uuid(),
  requestedServiceType: z.enum(SERVICE_TYPES), // admin's suggested default tier
  roomCounts: z.array(z.object({ roomTypeId: z.string().uuid(), count: z.number().int().nonnegative() })),
  travelZoneId: z.string().uuid().nullable(),
  dirtyCodeLevel: z.number().int().nullable(),
  notesToCustomer: z.string().optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /api/quotes — list, most recent first. */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: quotes.id,
      status: quotes.status,
      totalCents: quotes.totalCents,
      requestedServiceType: quotes.requestedServiceType,
      acceptedServiceType: quotes.acceptedServiceType,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      createdAt: quotes.createdAt,
      sentAt: quotes.sentAt,
      acceptedAt: quotes.acceptedAt,
      publicToken: quotes.publicToken,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .where(eq(quotes.companyId, admin.companyId))
    .orderBy(desc(quotes.createdAt));

  return NextResponse.json({ quotes: rows });
}

/** POST /api/quotes — creates a draft quote. Computes and stores ALL 7 service-tier
 * prices from the same room counts (not just one) so the customer can pick, matching
 * the company's real proposal — see DECISIONS.md 2026-07-14. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createQuoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const allTierPricing = await calculateAllTierPrices({
    serviceLocationId: data.serviceLocationId,
    roomCounts: data.roomCounts,
    travelZoneId: data.travelZoneId,
    dirtyCodeLevel: data.dirtyCodeLevel,
  });

  const publicToken = randomBytes(24).toString("base64url");

  const [quote] = await db
    .insert(quotes)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      status: "draft",
      publicToken,
      serviceLocationId: data.serviceLocationId,
      requestedServiceType: data.requestedServiceType,
      travelZoneId: data.travelZoneId,
      dirtyCodeLevel: data.dirtyCodeLevel,
      roomCounts: data.roomCounts,
      allTierPricing,
      totalCents: allTierPricing[data.requestedServiceType].finalCents,
      notesToCustomer: data.notesToCustomer,
      validUntil: data.validUntil,
    })
    .returning();

  return NextResponse.json({ quote }, { status: 201 });
}
