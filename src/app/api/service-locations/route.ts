import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { serviceLocations, travelZones } from "@/db/schema";
import { and, eq, asc, inArray } from "drizzle-orm";

/** GET /api/service-locations — locations with their travel zones. By default only
 * active locations (for the quote builder); pass ?all=1 to include inactive ones
 * too (for the Settings pricing page, so a disabled location can be re-enabled). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const includeInactive = req.nextUrl.searchParams.get("all") === "1";

  const locations = await db
    .select()
    .from(serviceLocations)
    .where(
      includeInactive
        ? eq(serviceLocations.companyId, admin.companyId)
        : and(eq(serviceLocations.companyId, admin.companyId), eq(serviceLocations.isActive, true))
    );

  const locationIds = locations.map((l) => l.id);
  // Scoped to THIS company's locations — a bare `select().from(travelZones)` here
  // would leak every company's zones once this app is ever multi-tenant.
  const zones = locationIds.length
    ? await db
        .select()
        .from(travelZones)
        .where(inArray(travelZones.serviceLocationId, locationIds))
        .orderBy(asc(travelZones.sortOrder))
    : [];

  const zonesByLocation = new Map<string, typeof zones>();
  for (const z of zones) {
    const list = zonesByLocation.get(z.serviceLocationId) ?? [];
    list.push(z);
    zonesByLocation.set(z.serviceLocationId, list);
  }

  const result = locations.map((loc) => ({
    ...loc,
    travelZones: zonesByLocation.get(loc.id) ?? [],
  }));

  return NextResponse.json({ locations: result });
}

const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  hourlyRateCents: z.number().int().positive(),
  // Partial map of serviceType -> minimum cents; z.record needs a plain string
  // key here (not the enum) because a fresh location won't have all 7 set yet.
  minimums: z.record(z.string(), z.number().int().nonnegative()).default({}),
  dirtyCodeTiers: z.array(z.object({ level: z.number().int(), discountPercent: z.number() })).default([]),
});

/** POST /api/service-locations — creates a new service area (e.g. expanding to a 3rd city). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = createLocationSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [location] = await db
    .insert(serviceLocations)
    .values({ companyId: admin.companyId, ...parsed.data })
    .returning();

  return NextResponse.json({ location }, { status: 201 });
}
