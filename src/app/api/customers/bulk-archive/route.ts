import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const bulkArchiveSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1).max(200),
});

/** POST /api/customers/bulk-archive — archives many customers at once from the
 * "eligible for archive" filtered list. Company-scoped: IDs that don't belong to
 * this company or are already archived are silently dropped rather than failing
 * the whole batch. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = bulkArchiveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(inArray(customers.id, parsed.data.customerIds), eq(customers.companyId, admin.companyId), eq(customers.isArchived, false)));

  const idsToArchive = rows.map((row) => row.id);

  if (idsToArchive.length) {
    const archivedAt = new Date();
    await db
      .update(customers)
      .set({ isArchived: true, archivedAt, updatedAt: archivedAt })
      .where(inArray(customers.id, idsToArchive));

    await db.insert(auditLog).values(
      idsToArchive.map((id) => ({
        companyId: admin.companyId,
        userId: admin.id,
        action: "customer.archived",
        entityType: "customer",
        entityId: id,
        before: null,
        after: { isArchived: true, bulk: true },
      }))
    );
  }

  return NextResponse.json({ ok: true, archivedCount: idsToArchive.length, skipped: parsed.data.customerIds.length - idsToArchive.length });
}
