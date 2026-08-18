import assert from "node:assert/strict";
import test from "node:test";
import { getSchedulingRecommendations, parseSchedulingSettings } from "../src/lib/scheduling/recommendations";
import { resolvePermittedServiceAreaNames } from "../src/lib/pricing/service-area-zips";

const tulsa = "tulsa"; const bartlesville = "bartlesville";
const employee = (id: string, locations: string[], overrides: Partial<{ isActive: boolean; isFieldStaff: boolean }> = {}) => ({ id, firstName: id, lastName: "Cleaner", isActive: overrides.isActive ?? true, isFieldStaff: overrides.isFieldStaff ?? true, serviceLocationIds: locations });
function input(overrides: Record<string, unknown> = {}) { return { startDate: "2026-08-24", endDate: "2026-08-28", serviceLocationId: tulsa, serviceType: "first_time", totalJthMinutes: 480, employees: [employee("t", [tulsa]), employee("both", [tulsa, bartlesville]), employee("b", [bartlesville])], pto: [], jobs: [], calendarEvents: [], ...overrides } as Parameters<typeof getSchedulingRecommendations>[0]; }

test("city + ZIP routing preserves Tulsa, Bartlesville, shared, city-sensitive, and unknown cases", () => {
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Tulsa", zip: "74105" }), ["Tulsa"]);
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Bartlesville", zip: "74006" }), ["Bartlesville"]);
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Wann", zip: "74083" }), ["Tulsa", "Bartlesville"]);
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Pawhuska", zip: "74056" }), ["Tulsa"]);
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Bowring", zip: "74056" }), ["Bartlesville"]);
  assert.deepEqual(resolvePermittedServiceAreaNames({ city: "Unknown", zip: "99999" }), []);
});

test("branch eligibility includes dual-eligible cleaners and excludes the other branch", () => {
  const options = getSchedulingRecommendations(input());
  assert.ok(options.length); assert.deepEqual(options[0].employeeIds.sort(), ["both", "t"]);
});

test("crew preference is one for recurring and two for first/deep/move-out, increasing only when needed", () => {
  assert.equal(getSchedulingRecommendations(input({ serviceType: "weekly", totalJthMinutes: 180 }))[0].crewSize, 1);
  assert.equal(getSchedulingRecommendations(input({ serviceType: "deep" }))[0].crewSize, 2);
  assert.equal(getSchedulingRecommendations(input({ serviceType: "move_in_out" }))[0].crewSize, 2);
  assert.equal(getSchedulingRecommendations(input({ totalJthMinutes: 960, employees: [employee("t", [tulsa]), employee("both", [tulsa, bartlesville]), employee("third", [tulsa])] }))[0].crewSize, 3);
});

test("morning, afternoon, and full-day PTO block only the relevant windows", () => {
  const morning = getSchedulingRecommendations(input({ serviceType: "weekly", totalJthMinutes: 180, pto: [{ userId: "t", startDate: "2026-08-24", endDate: "2026-08-24", startPeriod: "morning", endPeriod: "morning" }] }));
  assert.ok(morning.some((option) => option.arrivalWindowStartTime.startsWith("13:00")));
  const full = getSchedulingRecommendations(input({ serviceType: "weekly", pto: [{ userId: "t", startDate: "2026-08-24", endDate: "2026-08-28", startPeriod: "full", endPeriod: "full" }, { userId: "both", startDate: "2026-08-24", endDate: "2026-08-28", startPeriod: "full", endPeriod: "full" }] }));
  assert.equal(full.length, 0);
});

test("existing jobs use wall-clock demand, meetings conflict, cancelled/no-show do not, and transitions are preserved", () => {
  const job = { id: "job", scheduledDate: "2026-08-24", scheduledStartTime: "13:00:00", estimatedDurationMinutes: 480, status: "scheduled", assignedUserIds: ["t", "both"] };
  const blocked = getSchedulingRecommendations(input({ jobs: [job] }));
  assert.ok(!blocked.some((option) => option.date === "2026-08-24" && option.arrivalWindowStartTime.startsWith("09:00")));
  const cancelled = getSchedulingRecommendations(input({ jobs: [{ ...job, status: "cancelled" }] }));
  assert.ok(cancelled.some((option) => option.date === "2026-08-24"));
  const meeting = getSchedulingRecommendations(input({ serviceType: "weekly", calendarEvents: [{ id: "meeting", scheduledDate: "2026-08-24", startTime: "09:00:00", durationMinutes: 180, isAllDay: false, status: "scheduled", attendeeUserIds: ["t", "both"] }] }));
  assert.ok(!meeting.some((option) => option.date === "2026-08-24" && option.arrivalWindowStartTime.startsWith("09:00")));
});

test("workday end, inactive/non-field staff, and no capacity return no recommendation", () => {
  assert.equal(getSchedulingRecommendations(input({ totalJthMinutes: 1500 })).length, 0);
  assert.equal(getSchedulingRecommendations(input({ employees: [employee("inactive", [tulsa], { isActive: false }), employee("office", [tulsa], { isFieldStaff: false })] })).length, 0);
});

test("settings parser supplies the confirmed operational defaults", () => {
  const settings = parseSchedulingSettings({});
  assert.equal(settings.bookingWindows[0].startTime, "09:00:00"); assert.equal(settings.bookingWindows[1].endTime, "13:30:00"); assert.equal(settings.workdayEndTime, "17:00:00"); assert.equal(settings.transitionMinutes, 60); assert.equal(settings.maximumCrewSize, 3);
});
