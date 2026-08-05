import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers } from "@/db/schema";

const schema = z.object({ customerId: z.string().uuid(), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid geocode cache request" }, { status: 400 });
  await db.update(customers).set({ geocodedLatitude: String(parsed.data.latitude), geocodedLongitude: String(parsed.data.longitude), updatedAt: new Date() }).where(and(eq(customers.id, parsed.data.customerId), eq(customers.companyId, admin.companyId), isNull(customers.geocodedLatitude)));
  return NextResponse.json({ ok: true });
}
