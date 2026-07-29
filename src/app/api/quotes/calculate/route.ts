import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { serviceLocations, travelZones } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { calculateAllTierPrices, SERVICE_TYPES } from "@/lib/pricing/calculate";

const calcSchema = z.object({
  serviceLocationId: z.string().uuid(),
  serviceType: z.enum(SERVICE_TYPES), // which tier's detail to return as `breakdown`
  roomCounts: z.array(z.object({ roomTypeId: z.string().uuid(), count: z.number().int().nonnegative() })),
  travelZoneId: z.string().uuid().nullable(),
  dirtScore: z.number().int().min(1).max(10).nullable(),
});

/** POST /api/quotes/calculate — live price preview, no save. Computes every service
 * tier from the same room counts in one pass; `breakdown` is the requested tier's detail
 * (room-line breakdown) for the builder's main panel, `allTiers` is every tier's total
 * for the comparison table — matching the company's real proposal, which prices every
 * tier at once rather than one the admin pre-picks. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = calcSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [location] = await db.select({ id: serviceLocations.id }).from(serviceLocations).where(and(eq(serviceLocations.id, parsed.data.serviceLocationId), eq(serviceLocations.companyId, admin.companyId))).limit(1);
  if (!location) return NextResponse.json({ error: "Service location not found" }, { status: 404 });
  if (parsed.data.travelZoneId) {
    const [zone] = await db.select({ id: travelZones.id }).from(travelZones).where(and(eq(travelZones.id, parsed.data.travelZoneId), eq(travelZones.serviceLocationId, location.id))).limit(1);
    if (!zone) return NextResponse.json({ error: "Travel zone does not belong to the selected service location" }, { status: 400 });
  }

  const allTiers = await calculateAllTierPrices({
    serviceLocationId: parsed.data.serviceLocationId,
    roomCounts: parsed.data.roomCounts,
    travelZoneId: parsed.data.travelZoneId,
    dirtyCodeLevel: parsed.data.dirtScore == null ? null : parsed.data.dirtScore <= 2 ? 1 : parsed.data.dirtScore <= 5 ? 2 : parsed.data.dirtScore <= 8 ? 3 : 4,
  });

  return NextResponse.json({ breakdown: allTiers[parsed.data.serviceType], allTiers });
}
