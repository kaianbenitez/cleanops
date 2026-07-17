import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { roomTypes, roomTypeServiceWeights, quotes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

const updateRoomTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
});

/** PATCH /api/room-types/[roomTypeId] — rename or reorder a room type. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomTypeId: string }> }
) {
  const admin = await requireAdmin();
  const { roomTypeId } = await params;
  const body = await req.json();
  const parsed = updateRoomTypeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [existing] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Room type not found" }, { status: 404 });

  if (Object.keys(parsed.data).length > 0) {
    await db.update(roomTypes).set({ ...parsed.data, updatedAt: new Date() }).where(eq(roomTypes.id, roomTypeId));
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/room-types/[roomTypeId] — removes the room type and its
 * pricing weights. Blocked if any quote's saved room-count snapshot still
 * references it, since those are historical records we shouldn't orphan. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roomTypeId: string }> }
) {
  const admin = await requireAdmin();
  const { roomTypeId } = await params;

  const [existing] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Room type not found" }, { status: 404 });

  const [referencingQuote] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.companyId, admin.companyId), sql`${quotes.roomCounts} @> ${JSON.stringify([{ roomTypeId }])}::jsonb`))
    .limit(1);
  if (referencingQuote) {
    return NextResponse.json(
      { error: "This room type is used by an existing quote and can't be deleted. Deactivate it by removing it from future quotes instead." },
      { status: 409 }
    );
  }

  await db.delete(roomTypeServiceWeights).where(eq(roomTypeServiceWeights.roomTypeId, roomTypeId));
  await db.delete(roomTypes).where(eq(roomTypes.id, roomTypeId));

  return NextResponse.json({ ok: true });
}
