import { and, eq, isNotNull, or } from "drizzle-orm";
import { users } from "@/db/schema";

/** True for role="employee" always, and for role="admin" only when the admin
 * has also been marked as field staff (Settings → Administrators toggle).
 * Every query that assigns jobs, generates payroll, or clocks time in/out
 * should filter on this instead of `eq(users.role, "employee")` directly, so
 * an admin who also cleans is not invisible to those flows. */
export const isFieldEligible = or(eq(users.role, "employee"), and(eq(users.role, "admin"), eq(users.isFieldStaff, true)));

/** Payroll eligibility includes ordinary field staff plus active office admins
 * with an explicitly configured hourly rate. Keep this separate from field
 * eligibility because office admins do not need job-assignment access. */
export const isPayrollEligible = or(
  isFieldEligible,
  and(eq(users.role, "admin"), eq(users.payType, "office_hourly"), isNotNull(users.hourlyRateCents)),
);
