import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, customers, jobAssignments, jobs, roomTypes, services, timeEntries, users } from "@/db/schema";
import { isFieldEligible } from "@/lib/auth/field-staff";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const auditColumns = {
  id: auditLog.id,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  action: auditLog.action,
  before: auditLog.before,
  after: auditLog.after,
  createdAt: auditLog.createdAt,
  editorFirstName: users.firstName,
  editorLastName: users.lastName,
};

/**
 * Everything the job detail screen needs, in one company-scoped read.
 *
 * Two callers share this: the `/jobs/[jobId]` server component (first paint) and
 * `GET /api/jobs/[jobId]`, which the calendar's job panel still fetches. Keep the
 * returned shape stable — the API response is that shape JSON-serialised.
 *
 * `companyId` is required and applied to every query; do not add a caller that
 * skips it. Returns null when the job does not exist in that company, or when
 * `jobId` isn't a uuid at all (Postgres would otherwise raise 22P02 on the cast).
 */
export async function loadJobDetail(jobId: string, companyId: string) {
  if (!UUID_PATTERN.test(jobId)) return null;

  const [job] = await db
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      estimatedDurationMinutes: jobs.estimatedDurationMinutes,
      priceCents: jobs.priceCents,
      completionNotes: jobs.completionNotes,
      paymentMethodCollected: jobs.paymentMethodCollected,
      cleanerNotes: jobs.cleanerNotes,
      cancellationReason: jobs.cancellationReason,
      serviceId: jobs.serviceId,
      addOnIds: jobs.addOnIds,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerNotes: customers.generalNotes,
      homeDetails: customers.homeDetails,
      gateCodeOrKeyNotes: customers.gateCodeOrKeyNotes,
      petNotes: customers.petNotes,
      doNotClean: customers.doNotClean,
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
    .limit(1);

  if (!job) return null;

  const addOnIds = (job.addOnIds as string[]) ?? [];
  const catalogIds = [...(job.serviceId ? [job.serviceId] : []), ...addOnIds];
  const catalogRows = catalogIds.length
    ? await db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(and(inArray(services.id, catalogIds), eq(services.companyId, companyId)))
    : [];
  const catalogNameById = new Map(catalogRows.map((row) => [row.id, row.name]));
  const serviceName = job.serviceId ? (catalogNameById.get(job.serviceId) ?? null) : null;
  const addOnNames = addOnIds.map((id) => catalogNameById.get(id)).filter((name): name is string => !!name);

  const [assignments, entries, jobAuditLogs, configuredRoomTypes] = await Promise.all([
    db.select().from(jobAssignments).where(eq(jobAssignments.jobId, jobId)),
    db
      .select({
        id: timeEntries.id,
        userId: timeEntries.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        minutesWorked: timeEntries.minutesWorked,
        recordedByAdmin: timeEntries.recordedByAdmin,
        notes: timeEntries.notes,
      })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .where(eq(timeEntries.jobId, jobId)),
    db
      .select(auditColumns)
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "job"), eq(auditLog.entityId, jobId)))
      .orderBy(desc(auditLog.createdAt)),
    db
      .select({ id: roomTypes.id, name: roomTypes.name })
      .from(roomTypes)
      .where(eq(roomTypes.companyId, companyId))
      .orderBy(roomTypes.sortOrder),
  ]);

  const entryIds = entries.map((entry) => entry.id);
  const timeEntryAuditLogs = entryIds.length === 0 ? [] : await db
    .select(auditColumns)
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(eq(auditLog.companyId, companyId), eq(auditLog.entityType, "time_entry"), inArray(auditLog.entityId, entryIds)))
    .orderBy(desc(auditLog.createdAt));

  const homeDetails = job.homeDetails as Record<string, unknown>;
  const storedRoomCounts = homeDetails.roomCounts;
  const roomCountById = storedRoomCounts && typeof storedRoomCounts === "object" ? storedRoomCounts as Record<string, unknown> : {};
  const roomTypeNameById = new Map(configuredRoomTypes.map((roomType) => [roomType.id, roomType.name]));
  const roomCounts = Object.entries(roomCountById)
    .map(([roomTypeId, count]) => ({ name: roomTypeNameById.get(roomTypeId), count: Number(count) }))
    .filter((room): room is { name: string; count: number } => Boolean(room.name) && Number.isFinite(room.count) && room.count > 0);

  return { job: { ...job, roomCounts, serviceName, addOnNames }, assignments, timeEntries: entries, timeEntryAuditLogs, jobAuditLogs };
}

/** Active employees available to assign, same shape as `GET /api/employees`. */
export async function loadAssignableEmployees(companyId: string) {
  return db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.companyId, companyId), isFieldEligible, eq(users.isActive, true)))
    .orderBy(users.firstName);
}

/** Every employee (active or archived/force-deleted), for the Job Detail team
 * panel: a job's crew must still resolve names for employees who left after
 * being assigned, not just currently-active ones. Callers picking crew for
 * *new* work should keep using `loadAssignableEmployees` instead — this list
 * intentionally includes inactive people, tagged via `isActive`. */
export async function loadJobTeamEmployees(companyId: string) {
  return db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.companyId, companyId), isFieldEligible))
    .orderBy(users.firstName);
}
