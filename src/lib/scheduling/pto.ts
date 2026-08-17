import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employeePto, users } from "@/db/schema";

export type PtoPeriod = "full" | "morning" | "afternoon";

export type EmployeePtoRecord = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  startPeriod: PtoPeriod;
  endPeriod: PtoPeriod;
  note: string | null;
  firstName?: string;
  lastName?: string;
};

function periodForDate(pto: EmployeePtoRecord, date: string): PtoPeriod {
  if (pto.startDate === pto.endDate) {
    if (pto.startPeriod === pto.endPeriod) return pto.startPeriod;
    return "full";
  }
  if (date === pto.startDate) return pto.startPeriod;
  if (date === pto.endDate) return pto.endPeriod;
  return "full";
}

function jobPeriod(startTime?: string | null): PtoPeriod {
  if (!startTime) return "full";
  return startTime.slice(0, 5) < "12:00" ? "morning" : "afternoon";
}

function periodsOverlap(ptoPeriod: PtoPeriod, requestedPeriod: PtoPeriod) {
  return ptoPeriod === "full" || requestedPeriod === "full" || ptoPeriod === requestedPeriod;
}

export async function listEmployeePto({
  companyId,
  userId,
  startDate,
  endDate,
}: {
  companyId: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const filters = [eq(employeePto.companyId, companyId)];
  if (userId) filters.push(eq(employeePto.userId, userId));
  if (startDate) filters.push(gte(employeePto.endDate, startDate));
  if (endDate) filters.push(lte(employeePto.startDate, endDate));

  return db
    .select({
      id: employeePto.id,
      userId: employeePto.userId,
      startDate: employeePto.startDate,
      endDate: employeePto.endDate,
      startPeriod: employeePto.startPeriod,
      endPeriod: employeePto.endPeriod,
      note: employeePto.note,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(employeePto)
    .innerJoin(users, eq(employeePto.userId, users.id))
    .where(and(...filters))
    .orderBy(employeePto.startDate, employeePto.endDate);
}

export async function findPtoConflicts({
  companyId,
  employeeIds,
  scheduledDate,
  scheduledStartTime,
}: {
  companyId: string;
  employeeIds: string[];
  scheduledDate: string;
  scheduledStartTime?: string | null;
}) {
  if (employeeIds.length === 0) return [];

  const rows = await db
    .select({
      id: employeePto.id,
      userId: employeePto.userId,
      startDate: employeePto.startDate,
      endDate: employeePto.endDate,
      startPeriod: employeePto.startPeriod,
      endPeriod: employeePto.endPeriod,
      note: employeePto.note,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(employeePto)
    .innerJoin(users, eq(employeePto.userId, users.id))
    .where(and(
      eq(employeePto.companyId, companyId),
      inArray(employeePto.userId, employeeIds),
      lte(employeePto.startDate, scheduledDate),
      gte(employeePto.endDate, scheduledDate),
    ));

  const requestedPeriod = jobPeriod(scheduledStartTime);
  return rows.filter((row) => periodsOverlap(periodForDate(row, scheduledDate), requestedPeriod));
}

export function ptoConflictMessage(conflicts: Array<{ firstName: string; lastName: string }>) {
  const names = conflicts.map((conflict) => `${conflict.firstName} ${conflict.lastName}`);
  return `${names.join(", ")} ${names.length === 1 ? "is" : "are"} marked unavailable for this date and time.`;
}

/** Hours a single PTO record takes off a given date, for capacity planning.
 * Caller must already have confirmed `pto` covers `date` (startDate <= date
 * <= endDate) — this only resolves full vs. half day via `periodForDate`. */
export function ptoHoursForDate(pto: EmployeePtoRecord, date: string, workdayHours: number): number {
  return periodForDate(pto, date) === "full" ? workdayHours : workdayHours / 2;
}
