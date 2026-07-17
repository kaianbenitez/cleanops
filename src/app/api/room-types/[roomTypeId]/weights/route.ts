import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { roomTypes, roomTypeServiceWeights, serviceTypeEnum } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const updateWeightSchema = z.object({
  serviceType: z.enum(serviceTypeEnum),
  weightHours: z.number().nonnegative(),
});

/** PATCH /api/room-types/[roomTypeId]/weights — set the hours-per-room weight
 * for one service tier. Every room type has a weight row per tier already
 * (created at room-type creation time), so this is always an update, never
 * an insert. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomTypeId: string }> }
) {
  const admin = await requireAdmin();
  const { roomTypeId } = await params;
  const body = await req.json();
  const parsed = updateWeightSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [roomType] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.companyId, admin.companyId)))
    .limit(1);
  if (!roomType) return NextResponse.json({ error: "Room type not found" }, { status: 404 });

  await db
    .update(roomTypeServiceWeights)
    .set({ weightHours: parsed.data.weightHours.toFixed(3), updatedAt: new Date() })
    .where(and(eq(roomTypeServiceWeights.roomTypeId, roomTypeId), eq(roomTypeServiceWeights.serviceType, parsed.data.serviceType)));

  return NextResponse.json({ ok: true });
}
