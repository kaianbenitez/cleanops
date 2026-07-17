import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { roomTypes, roomTypeServiceWeights, serviceTypeEnum } from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";

/** GET /api/room-types — company's room type list with pricing weights, for
 * both the quote builder's count inputs and the admin room-types settings page. */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.companyId, admin.companyId))
    .orderBy(asc(roomTypes.sortOrder));

  const roomTypeIds = rows.map((r) => r.id);
  const weights = roomTypeIds.length
    ? await db.select().from(roomTypeServiceWeights).where(inArray(roomTypeServiceWeights.roomTypeId, roomTypeIds))
    : [];

  const weightsByRoomType = new Map<string, typeof weights>();
  for (const w of weights) {
    const list = weightsByRoomType.get(w.roomTypeId) ?? [];
    list.push(w);
    weightsByRoomType.set(w.roomTypeId, list);
  }

  const result = rows.map((r) => ({ ...r, weights: weightsByRoomType.get(r.id) ?? [] }));

  return NextResponse.json({ roomTypes: result });
}

const createRoomTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().optional(),
});

/** POST /api/room-types — add a new room type. Every service-tier weight
 * starts at 0 and is filled in on the settings page afterward. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createRoomTypeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [roomType] = await db
    .insert(roomTypes)
    .values({ companyId: admin.companyId, name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 0 })
    .returning();

  await db.insert(roomTypeServiceWeights).values(
    serviceTypeEnum.map((serviceType) => ({ roomTypeId: roomType.id, serviceType, weightHours: "0" }))
  );

  return NextResponse.json({ roomType }, { status: 201 });
}
