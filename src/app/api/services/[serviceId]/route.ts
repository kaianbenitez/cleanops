import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  defaultPriceCents: z.number().int().nonnegative().optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/services/[serviceId] — edit catalog entry fields, or deactivate. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> }
) {
  const admin = await requireAdmin();
  const { serviceId } = await params;
  const body = await req.json();
  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  if (Object.keys(parsed.data).length > 0) {
    await db.update(services).set({ ...parsed.data, updatedAt: new Date() }).where(eq(services.id, serviceId));
  }

  return NextResponse.json({ ok: true });
}
