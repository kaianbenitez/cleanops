import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, jobs, recurringSeries } from "@/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";

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
  let cancelledJobIds: string[] = [];
  let endedSeriesIds: string[] = [];

  if (idsToArchive.length) {
    const archivedAt = new Date();
    const today = archivedAt.toISOString().slice(0, 10);
    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ isArchived: true, archivedAt, updatedAt: archivedAt })
        .where(and(inArray(customers.id, idsToArchive), eq(customers.companyId, admin.companyId)));

      const cancelledJobs = await tx
        .update(jobs)
        .set({ status: "cancelled", cancellationReason: "Customer archived", updatedAt: archivedAt })
        .where(and(inArray(jobs.customerId, idsToArchive), eq(jobs.companyId, admin.companyId), eq(jobs.status, "scheduled"), gte(jobs.scheduledDate, today)))
        .returning({ id: jobs.id });
      cancelledJobIds = cancelledJobs.map((job) => job.id);

      const endedSeries = await tx
        .update(recurringSeries)
        .set({ isActive: false, endDate: today, updatedAt: archivedAt })
        .where(and(inArray(recurringSeries.customerId, idsToArchive), eq(recurringSeries.companyId, admin.companyId), eq(recurringSeries.isActive, true)))
        .returning({ id: recurringSeries.id });
      endedSeriesIds = endedSeries.map((series) => series.id);

      await tx.insert(auditLog).values(idsToArchive.map((id) => ({
        companyId: admin.companyId,
        userId: admin.id,
        action: "customer.archived",
        entityType: "customer",
        entityId: id,
        before: null,
        after: { isArchived: true, bulk: true },
      })));
    });

    if (cancelledJobIds.length) {
      await db.insert(auditLog).values(cancelledJobIds.map((jobId) => ({
        companyId: admin.companyId,
        userId: admin.id,
        action: "job.updated",
        entityType: "job",
        entityId: jobId,
        before: { status: "scheduled" },
        after: { status: "cancelled", cancellationReason: "Customer archived", customerArchived: true, bulk: true },
      })));
    }

    if (endedSeriesIds.length) {
      await db.insert(auditLog).values(endedSeriesIds.map((seriesId) => ({
        companyId: admin.companyId,
        userId: admin.id,
        action: "recurring_service.suspended",
        entityType: "recurring_series",
        entityId: seriesId,
        before: { isActive: true },
        after: { isActive: false, endDate: today, customerArchived: true, bulk: true },
      })));
    }
  }

  return NextResponse.json({ ok: true, archivedCount: idsToArchive.length, skipped: parsed.data.customerIds.length - idsToArchive.length });
}
