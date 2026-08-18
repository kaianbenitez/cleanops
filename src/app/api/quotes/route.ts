import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { quotes, customers, customerLocations, serviceLocations, travelZones } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { calculateAllTierPrices, SERVICE_TYPES } from "@/lib/pricing/calculate";
import { resolveAddressServiceArea, resolveCustomerServiceArea } from "@/lib/service-area";
import { resolvePermittedServiceAreaNames } from "@/lib/pricing/service-area-zips";

const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  serviceAddressLocationId: z.string().uuid().optional(),
  serviceLocationId: z.string().uuid(),
  requestedServiceType: z.enum(SERVICE_TYPES).nullable().optional(), // admin's suggested default tier — optional, every tier is priced and sent regardless
  roomCounts: z.array(z.object({ roomTypeId: z.string().uuid(), count: z.number().int().nonnegative() })),
  travelZoneId: z.string().uuid().nullable(),
  dirtScore: z.number().int().min(1).max(10).nullable(),
  clutterScore: z.number().int().min(1).max(10).nullable(),
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
  const dirtyCodeLevel = data.dirtScore == null ? null : data.dirtScore <= 2 ? 1 : data.dirtScore <= 5 ? 2 : data.dirtScore <= 8 ? 3 : 4;

  const [customer] = await db
    .select({ id: customers.id, zip: customers.zip, homeDetails: customers.homeDetails })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const [location] = await db.select({ id: serviceLocations.id, name: serviceLocations.name }).from(serviceLocations).where(and(eq(serviceLocations.id, data.serviceLocationId), eq(serviceLocations.companyId, admin.companyId))).limit(1);
  if (!location) return NextResponse.json({ error: "Service location not found" }, { status: 404 });
  if (data.travelZoneId) {
    const [zone] = await db.select({ id: travelZones.id }).from(travelZones).where(and(eq(travelZones.id, data.travelZoneId), eq(travelZones.serviceLocationId, location.id))).limit(1);
    if (!zone) return NextResponse.json({ error: "Travel zone does not belong to the selected service location" }, { status: 400 });
  }

  const [selectedAddress] = data.serviceAddressLocationId
    ? await db.select({ addressLine1: customerLocations.addressLine1, city: customerLocations.city, state: customerLocations.state, zip: customerLocations.zip, subdivision: customerLocations.subdivision, label: customerLocations.label }).from(customerLocations).where(and(eq(customerLocations.id, data.serviceAddressLocationId), eq(customerLocations.customerId, data.customerId), eq(customerLocations.companyId, admin.companyId))).limit(1)
    : [];
  if (data.serviceAddressLocationId && !selectedAddress) return NextResponse.json({ error: "Selected service address was not found for this customer." }, { status: 400 });
  const addressCity = selectedAddress?.city ?? null;
  const addressZip = selectedAddress?.zip ?? customer.zip;
  const permittedBranchNames = resolvePermittedServiceAreaNames({ city: addressCity, zip: addressZip });
  if (permittedBranchNames.length && !permittedBranchNames.some((branch) => branch.toLowerCase() === location.name.toLowerCase())) {
    return NextResponse.json({ error: `This city and ZIP are served by ${permittedBranchNames.join(" or ")}. Choose one of those branches.` }, { status: 400 });
  }
  const serviceArea = selectedAddress
    ? await resolveAddressServiceArea({ companyId: admin.companyId, serviceLocationId: data.serviceLocationId, address: { ...selectedAddress, addressLabel: selectedAddress.label } })
    : await resolveCustomerServiceArea({ companyId: admin.companyId, customerId: data.customerId, serviceLocationId: data.serviceLocationId });
  if (serviceArea.status === "missing_address") {
    return NextResponse.json({ error: "This customer is missing an address. Add city or ZIP before quoting." }, { status: 400 });
  }
  // The branch ZIP list is authoritative; travel zones only provide an optional
  // local fee and are not a complete branch-boundary dataset.
  if (!permittedBranchNames.length && (serviceArea.status === "outside_area" || serviceArea.status === "no_service_zones")) {
    // Unknown areas are never silently routed. An explicit branch selection is
    // already required by the form; this message makes the decision visible.
    return NextResponse.json({ error: "This address is not in a mapped service area. Confirm the selected branch deliberately before quoting." }, { status: 400 });
  }

  const allTierPricing = await calculateAllTierPrices({
    serviceLocationId: data.serviceLocationId,
    roomCounts: data.roomCounts,
    travelZoneId: data.travelZoneId,
    dirtyCodeLevel,
  });

  const publicToken = randomBytes(24).toString("base64url");

  const [quote] = await db
    .insert(quotes)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      status: "draft",
      publicToken,
      createdByUserId: admin.id,
      serviceLocationId: data.serviceLocationId,
      requestedServiceType: data.requestedServiceType ?? null,
      travelZoneId: data.travelZoneId,
      dirtyCodeLevel,
      dirtScore: data.dirtScore,
      clutterScore: data.clutterScore,
      roomCounts: data.roomCounts,
      allTierPricing,
      totalCents: data.requestedServiceType ? allTierPricing[data.requestedServiceType].finalCents : 0,
      notesToCustomer: data.notesToCustomer,
      validUntil: data.validUntil,
    })
    .returning();

  // Quotes store counts as an array for pricing; the customer profile stores
  // them as a record for direct lookup. Keep the profile in sync with the
  // latest quote without relying on the client to submit the same data twice.
  await db
    .update(customers)
    .set({
      homeDetails: {
        ...(customer.homeDetails as Record<string, unknown>),
        roomCounts: Object.fromEntries(data.roomCounts.map(({ roomTypeId, count }) => [roomTypeId, count])),
      },
    })
    .where(and(eq(customers.id, customer.id), eq(customers.companyId, admin.companyId)));

  return NextResponse.json({ quote }, { status: 201 });
}
