import assert from "node:assert/strict";
import test from "node:test";

async function payrollModules() {
  process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/cleanops";
  return {
    periods: await import("@/lib/payroll/periods"),
    calculate: await import("@/lib/payroll/calculate"),
  };
}

test("payroll weeks are Monday through Sunday and pay Friday", async () => {
  const { periods } = await payrollModules();
  const { payrollPayDate, payrollWeekRangeForDate, isMondayToSundayPeriod } = periods;
  assert.deepEqual(payrollWeekRangeForDate("2026-08-09"), { startDate: "2026-08-03", endDate: "2026-08-09" });
  assert.equal(payrollPayDate("2026-08-03"), "2026-08-14");
  assert.equal(isMondayToSundayPeriod("2026-08-03", "2026-08-09"), true);
  assert.equal(isMondayToSundayPeriod("2026-08-04", "2026-08-10"), false);
});

test("tier rates select the configured rate at every bracket boundary", async () => {
  const { calculate } = await payrollModules();
  const { resolveTierRateCents } = calculate;
  const tiers = [
    { minHours: 0, maxHours: 25.99, rateCents: 1200 },
    { minHours: 26, maxHours: 29.99, rateCents: 1300 },
    { minHours: 30, maxHours: 33.99, rateCents: 1400 },
    { minHours: 34, maxHours: null, rateCents: 1500 },
  ];
  assert.deepEqual(
    [0, 25.99, 26, 29.99, 30, 33.99, 34].map((hours) => resolveTierRateCents(hours, tiers, 999)),
    [1200, 1200, 1300, 1300, 1400, 1400, 1500]
  );
});

test("tips split deterministically and overages require approval", async () => {
  const { calculate } = await payrollModules();
  assert.deepEqual([0, 1, 2].map((index) => calculate.splitTipCents(100, index, 3)), [34, 33, 33]);
  assert.deepEqual(calculate.paidMinutesForJob(120, 90, 2), { paidMinutes: 120, varianceStatus: undefined });
  assert.deepEqual(calculate.paidMinutesForJob(120, 150, 2), { paidMinutes: 120, varianceStatus: "pending" });
  assert.deepEqual(calculate.paidMinutesForJob(120, 150, 2, { status: "approved", approvedMinutes: 150 }), { paidMinutes: 150, varianceStatus: "approved" });
  assert.deepEqual(calculate.paidMinutesForJob(120, 150, 2, { status: "rejected", approvedMinutes: null }), { paidMinutes: 120, varianceStatus: "rejected" });
});

test("final pay includes manual components and subtracts advances", async () => {
  const { calculate } = await payrollModules();
  const { calculateFinalCents } = calculate;
  assert.equal(calculateFinalCents({
    commissionCents: 10000,
    officePayCents: 0,
    mileageCents: 3500,
    tipsPaycheckCents: 1200,
    tipsCashCents: 300,
    clientTipsCents: 0,
    bonusCents: 500,
    teamLeadBonusCents: 200,
    trainerBonusCents: 100,
    trainingCents: 750,
    adjustmentCents: -50,
    payrollAdvanceCents: 1000,
  }), 15500);
});

test("Gusto export blocks unmapped components and preserves manual office hours", async () => {
  const { gusto } = { gusto: await import("@/lib/payroll/gusto-csv") };
  const line = {
    id: "line-1", userId: "user-1", firstName: "Ava", lastName: "Jones", role: "admin", title: "Office", gustoEmployeeId: "gusto-1",
    payType: "office_hourly", hourlyRateCents: 2000, jobsCount: 0, regularHours: "0", commissionCents: 0, officeHours: "2.00", manualOfficeHours: "1.50", officePayCents: 7000,
    mileageMiles: "0", mileageRateCents: 35, mileageCents: 0, tipsPaycheckCents: 0, tipsCashCents: 0, bonusCents: 0, teamLeadBonusCents: 0, trainerBonusCents: 0,
    clientTipsCents: 0, trainingCents: 0, payrollAdvanceCents: 0, gustoNetPayCents: null, adjustmentCents: 0, adjustmentNote: null, finalCents: 7000, calculation: [],
  } as Parameters<typeof gusto.buildGustoCsv>[0][number];
  assert.equal(gusto.validateGustoExport([line]).ok, true);
  assert.match(gusto.buildGustoCsv([line]).split("\n")[1], /,3\.50,/);
  const blocked = { ...line, adjustmentCents: 1, finalCents: 7001 };
  assert.equal(gusto.validateGustoExport([blocked]).ok, false);
  assert.match(gusto.validateGustoExport([blocked]).blockers.map((item) => item.reason).join(" "), /adjustment/);
});
