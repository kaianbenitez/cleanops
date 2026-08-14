import { and, eq, isNotNull, or } from "drizzle-orm";
import { users } from "@/db/schema";
import type { CurrentUser } from "./current-user";

/** True for role="employee" always, and for role="admin" only when the admin
 * has also been marked as field staff (Settings → Administrators toggle).
 * Every query that assigns jobs, generates payroll, or clocks time in/out
 * should filter on this instead of `eq(users.role, "employee")` directly, so
 * an admin who also cleans is not invisible to those flows.
 * Must stay in lockstep with `hasFieldAccess` below — this is the SQL form of
 * the same rule, kept separate because it can't run in a `WHERE` clause. */
export const isFieldEligible = or(eq(users.role, "employee"), and(eq(users.role, "admin"), eq(users.isFieldStaff, true)));

/** TS mirror of `isFieldEligible` for use in route guards against a `CurrentUser`
 * object, where the SQL predicate above can't be evaluated. Must stay in
 * lockstep with `isFieldEligible`. */
export function hasFieldAccess(user: Pick<CurrentUser, "role" | "isFieldStaff">) {
  return user.role === "employee" || (user.role === "admin" && user.isFieldStaff);
}

export function hasAdminAccess(user: Pick<CurrentUser, "role">) {
  return user.role === "admin";
}

/** Payroll eligibility includes ordinary field staff plus active office admins
 * with an explicitly configured hourly rate. Keep this separate from field
 * eligibility because office admins do not need job-assignment access. */
export const isPayrollEligible = or(
  isFieldEligible,
  and(eq(users.role, "admin"), eq(users.payType, "office_hourly"), isNotNull(users.hourlyRateCents)),
);
