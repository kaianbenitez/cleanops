import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { calculateAllTierPrices, SERVICE_TYPES } from "@/lib/pricing/calculate";

const calcSchema = z.object({
  serviceLocationId: z.string().uuid(),
  serviceType: z.enum(SERVICE_TYPES), // which tier's detail to return as `breakdown`
  roomCounts: z.array(z.object({ roomTypeId: z.string().uuid(), count: z.number().int().nonnegative() })),
  travelZoneId: z.string().uuid().nullable(),
  dirtyCodeLevel: z.number().int().nullable(),
});

/** POST /api/quotes/calculate — live price preview, no save. Computes every service
 * tier from the same room counts in one pass; `breakdown` is the requested tier's detail
 * (room-line breakdown) for the builder's main panel, `allTiers` is every tier's total
 * for the comparison table — matching the company's real proposal, which prices every
 * tier at once rather than one the admin pre-picks. */
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json();
  const parsed = calcSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const allTiers = await calculateAllTierPrices({
    serviceLocationId: parsed.data.serviceLocationId,
    roomCounts: parsed.data.roomCounts,
    travelZoneId: parsed.data.travelZoneId,
    dirtyCodeLevel: parsed.data.dirtyCodeLevel,
  });

  return NextResponse.json({ breakdown: allTiers[parsed.data.serviceType], allTiers });
}
