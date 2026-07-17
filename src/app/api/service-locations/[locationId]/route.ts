import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { serviceLocations } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const updateLocationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  hourlyRateCents: z.number().int().positive().optional(),
  minimums: z.record(z.string(), z.number().int().nonnegative()).optional(),
  dirtyCodeTiers: z.array(z.object({ level: z.number().int(), discountPercent: z.number() })).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/service-locations/[locationId] — edit hourly rate, per-service-type
 * minimums, and dirty-code discount tiers for one location (e.g. Bartlesville, Tulsa). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const admin = await requireAdmin();
  const { locationId } = await params;
  const parsed = updateLocationSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [existing] = await db
    .select({ id: serviceLocations.id })
    .from(serviceLocations)
    .where(and(eq(serviceLocations.id, locationId), eq(serviceLocations.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const [updated] = await db
    .update(serviceLocations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(serviceLocations.id, locationId))
    .returning();

  return NextResponse.json({ location: updated });
}
