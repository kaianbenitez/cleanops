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
 *     clocked + manual office hours for office_hourly employees (both
 *     buckets are stored separately in our payroll_lines and merged here
 *     into Gusto's single regular_hours column).
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

export type GustoExportBlocker = {
  lineId: string;
  employee: string;
  reason: string;
};

/**
 * Validate the deliberately small, manual-import mapping before producing a
 * file. Components without a confirmed Gusto representation must never be
 * silently dropped from an approved payroll line.
 */
export function validateGustoExport(lines: PayrollLine[]) {
  const blockers: GustoExportBlocker[] = [];
  const reconciliations = lines.map((line) => {
    const employee = `${line.firstName} ${line.lastName}`;
    if (!line.gustoEmployeeId?.trim()) {
      blockers.push({ lineId: line.id, employee, reason: "Missing Gusto employee ID." });
    }

    const unsupported: Array<[string, number]> = [
      ["team-lead bonus", line.teamLeadBonusCents],
      ["training pay", line.trainingCents],
      ["payroll advance", line.payrollAdvanceCents],
      ["adjustment", line.adjustmentCents],
    ];
    for (const [label, cents] of unsupported) {
      if (cents !== 0) blockers.push({ lineId: line.id, employee, reason: `${label} has no confirmed Gusto mapping.` });
    }

    const representedCents =
      line.commissionCents +
      line.officePayCents +
      line.mileageCents +
      line.tipsPaycheckCents +
      line.tipsCashCents +
      line.clientTipsCents +
      line.bonusCents +
      line.trainerBonusCents;
    if (representedCents !== line.finalCents) {
      blockers.push({ lineId: line.id, employee, reason: `CSV components reconcile to ${representedCents} cents, but the approved line is ${line.finalCents} cents.` });
    }

    return { lineId: line.id, representedCents, approvedCents: line.finalCents };
  });

  return { ok: blockers.length === 0, blockers, reconciliations };
}

export function buildGustoCsv(lines: PayrollLine[]): string {
  const rows = [HEADERS.join(",")];

  for (const line of lines) {
    const regularHours = line.payType === "commission_jth"
      ? line.regularHours
      : (Number(line.officeHours) + Number(line.manualOfficeHours)).toFixed(2);
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
      centsToDollarsStr(line.bonusCents + line.trainerBonusCents),
      centsToDollarsStr(line.commissionCents),
      centsToDollarsStr(line.tipsPaycheckCents + line.clientTipsCents),
      centsToDollarsStr(line.tipsCashCents),
      centsToDollarsStr(correctionPaymentCents),
      centsToDollarsStr(line.mileageCents),
      "",
    ].map((v) => csvEscape(String(v)));

    rows.push(row.join(","));
  }

  return rows.join("\n");
}
