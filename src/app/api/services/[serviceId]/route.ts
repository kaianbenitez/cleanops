import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// category is intentionally not editable after creation — recategorizing a
// live preset out from under jobs/New Job that already reference it would be
// confusing; delete/deactivate and add a new one instead.
const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  defaultPriceCents: z.number().int().nonnegative().nullable().optional(),
  priceLabel: z.string().trim().max(200).nullable().optional(),
  defaultDurationMinutes: z.number().int().positive().nullable().optional(),
  availableAddOnIds: z.array(z.string().uuid()).optional(),
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
    .select({ id: services.id, category: services.category })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.companyId, admin.companyId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  if (parsed.data.availableAddOnIds?.length) {
    const validAddOns = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.companyId, admin.companyId), eq(services.category, "add_on")));
    const validIds = new Set(validAddOns.map((row) => row.id));
    if (!parsed.data.availableAddOnIds.every((id) => validIds.has(id))) {
      return NextResponse.json({ error: "One or more add-ons were not found" }, { status: 400 });
    }
  }

  if (Object.keys(parsed.data).length > 0) {
    await db.update(services).set({ ...parsed.data, updatedAt: new Date() }).where(eq(services.id, serviceId));
  }

  return NextResponse.json({ ok: true });
}
