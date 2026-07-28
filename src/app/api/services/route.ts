import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { services, serviceCategoryEnum } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** GET /api/services?all=1&category=main|add_on — service catalog. Defaults
 * to active-only (for price/duration prefill pickers); ?all=1 includes
 * inactive rows too, for the admin settings page. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";
  const category = searchParams.get("category");

  const conditions = [eq(services.companyId, admin.companyId)];
  if (!includeInactive) conditions.push(eq(services.isActive, true));
  if (category === "main" || category === "add_on") conditions.push(eq(services.category, category));

  const rows = await db
    .select()
    .from(services)
    .where(and(...conditions))
    .orderBy(services.name);

  return NextResponse.json({ services: rows });
}

const createServiceSchema = z
  .object({
    category: z.enum(serviceCategoryEnum).default("main"),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    defaultPriceCents: z.number().int().nonnegative().nullable().optional(),
    priceLabel: z.string().trim().max(200).nullable().optional(),
    defaultDurationMinutes: z.number().int().positive().nullable().optional(),
    availableAddOnIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.category !== "main" || data.defaultPriceCents != null, {
    message: "Main jobs require a default price",
    path: ["defaultPriceCents"],
  })
  .refine((data) => data.category !== "main" || data.defaultDurationMinutes != null, {
    message: "Main jobs require a default duration",
    path: ["defaultDurationMinutes"],
  })
  .refine((data) => data.category !== "add_on" || data.defaultPriceCents != null || !!data.priceLabel?.trim(), {
    message: "Add-ons need either a price or a price note (e.g. \"$10-$20 per window\")",
    path: ["priceLabel"],
  });

/** POST /api/services — add a new catalog entry (a "main" job preset or an
 * "add_on" extra). Main presets show up on the New Job form's Job type picker
 * alongside the built-in types; add-ons show up as optional extras. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

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

  const [service] = await db
    .insert(services)
    .values({ companyId: admin.companyId, ...parsed.data, isActive: true })
    .returning();

  return NextResponse.json({ service }, { status: 201 });
}
