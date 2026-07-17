import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { serviceLocations, travelZones } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const createZoneSchema = z.object({
  name: z.string().trim().min(1).max(100),
  feeCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().nonnegative().optional(),
});

/** POST /api/service-locations/[locationId]/travel-zones — adds a new town/zip
 * travel-fee zone to a location. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const admin = await requireAdmin();
  const { locationId } = await params;
  const parsed = createZoneSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [location] = await db
    .select({ id: serviceLocations.id })
    .from(serviceLocations)
    .where(and(eq(serviceLocations.id, locationId), eq(serviceLocations.companyId, admin.companyId)))
    .limit(1);
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const [zone] = await db
    .insert(travelZones)
    .values({ serviceLocationId: locationId, ...parsed.data })
    .returning();

  return NextResponse.json({ zone }, { status: 201 });
}
