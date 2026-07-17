import type { getPayrollLinesForPeriod } from "./calculate";

/**
 * Builds a CSV matching the company's actual Gusto import template (columns
 * confirmed from their real payroll spreadsheet, "Copy of Jun 29 - Jul 3",
 * row 23): last_name, first_name, title, gusto_employee_id, regular_hours,
 * overtime_hours, double_overtime_hours, missed_break_hours, holiday_hours,
 * bonus, commission, paycheck_tips, cash_tips, correction_payment,
 * reimbursement, personal_note.
 *
 * Confirmed mappings (verified against a real row in that sheet):
 *   - reimbursement = mileage dollars (Row 24: P24=29.05 matched Table 1's
 *     mileage column for the same employee exactly).
 *   - regular_hours = Job Ticket Hours for commission_jth employees, actual
 *     clocked hours for office_hourly employees (both buckets are stored
 *     separately in our payroll_lines and merged here into Gusto's single
 *     regular_hours column).
 *
 * UNCONFIRMED mapping (no populated example existed in the source sheet —
 * verify with the owner or Gusto's docs before relying on this for a real
 * payroll run): training pay and payroll-advance deductions are netted
 * into correction_payment (training positive, advance negative).
 */
const HEADERS = [
  "last_name",
  "first_name",
  "title",
  "gusto_employee_id",
  "regular_hours",
  "overtime_hours",
  "double_overtime_hours",
  "missed_break_hours",
  "holiday_hours",
  "bonus",
  "commission",
  "paycheck_tips",
  "cash_tips",
  "correction_payment",
  "reimbursement",
  "personal_note",
] as const;

function centsToDollarsStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type PayrollLine = Awaited<ReturnType<typeof getPayrollLinesForPeriod>>[number];

export function buildGustoCsv(lines: PayrollLine[]): string {
  const rows = [HEADERS.join(",")];

  for (const line of lines) {
    const regularHours = line.payType === "commission_jth" ? line.regularHours : line.officeHours;
    const correctionPaymentCents = line.trainingCents - line.payrollAdvanceCents;

    const row = [
      line.lastName,
      line.firstName,
      line.title ?? "",
      line.gustoEmployeeId ?? "",
      regularHours,
      "0", // overtime_hours — not tracked in v1
      "0", // double_overtime_hours
      "0", // missed_break_hours
      "0", // holiday_hours
      centsToDollarsStr(line.bonusCents),
      centsToDollarsStr(line.commissionCents),
      centsToDollarsStr(line.tipsPaycheckCents),
      centsToDollarsStr(line.tipsCashCents),
      centsToDollarsStr(correctionPaymentCents),
      centsToDollarsStr(line.mileageCents),
      "",
    ].map((v) => csvEscape(String(v)));

    rows.push(row.join(","));
  }

  return rows.join("\n");
}
