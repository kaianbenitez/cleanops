import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { serviceLocations, travelZones, quotes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  feeCents: z.number().int().nonnegative().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

async function verifyZoneInCompany(locationId: string, zoneId: string, companyId: string) {
  const [row] = await db
    .select({ zoneId: travelZones.id })
    .from(travelZones)
    .innerJoin(serviceLocations, eq(travelZones.serviceLocationId, serviceLocations.id))
    .where(
      and(
        eq(travelZones.id, zoneId),
        eq(travelZones.serviceLocationId, locationId),
        eq(serviceLocations.companyId, companyId)
      )
    )
    .limit(1);
  return !!row;
}

/** PATCH /api/service-locations/[locationId]/travel-zones/[zoneId] — edit a zone's
 * name/fee (e.g. correcting a mileage-based fee). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ locationId: string; zoneId: string }> }
) {
  const admin = await requireAdmin();
  const { locationId, zoneId } = await params;
  const parsed = updateZoneSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!(await verifyZoneInCompany(locationId, zoneId, admin.companyId))) {
    return NextResponse.json({ error: "Travel zone not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(travelZones)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(travelZones.id, zoneId))
    .returning();

  return NextResponse.json({ zone: updated });
}

/** DELETE /api/service-locations/[locationId]/travel-zones/[zoneId] — removes a zone.
 * `quotes.travelZoneId` has no ON DELETE cascade, so a zone referenced by any past
 * quote can't be deleted without a raw FK error — checked explicitly here so the
 * admin gets a clear message ("used by N quotes") instead of a 500. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ locationId: string; zoneId: string }> }
) {
  const admin = await requireAdmin();
  const { locationId, zoneId } = await params;

  if (!(await verifyZoneInCompany(locationId, zoneId, admin.companyId))) {
    return NextResponse.json({ error: "Travel zone not found" }, { status: 404 });
  }

  const referencingQuotes = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.travelZoneId, zoneId));

  if (referencingQuotes.length > 0) {
    return NextResponse.json(
      { error: `This zone is used by ${referencingQuotes.length} existing quote(s) and can't be deleted. Edit its fee instead, or rename it.` },
      { status: 409 }
    );
  }

  await db.delete(travelZones).where(eq(travelZones.id, zoneId));
  return NextResponse.json({ ok: true });
}
