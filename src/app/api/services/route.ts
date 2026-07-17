import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { services } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** GET /api/services?all=1 — service catalog. Defaults to active-only (for
 * price/duration prefill pickers); ?all=1 includes inactive rows too, for
 * the admin settings page. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  const rows = await db
    .select()
    .from(services)
    .where(includeInactive ? eq(services.companyId, admin.companyId) : and(eq(services.companyId, admin.companyId), eq(services.isActive, true)))
    .orderBy(services.name);

  return NextResponse.json({ services: rows });
}

const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  defaultPriceCents: z.number().int().nonnegative(),
  defaultDurationMinutes: z.number().int().positive(),
});

/** POST /api/services — add a new catalog entry (used to prefill price/duration on New Job). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [service] = await db
    .insert(services)
    .values({ companyId: admin.companyId, ...parsed.data, isActive: true })
    .returning();

  return NextResponse.json({ service }, { status: 201 });
}
