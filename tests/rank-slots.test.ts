import assert from "node:assert/strict";
import test from "node:test";
import { rankSlots, haversineMiles, type ProximityStop } from "../src/lib/scheduling/rank-slots";
import type { CustomerSchedulingProfile } from "../src/lib/scheduling/slot-contract";
import type { SchedulingRecommendation } from "../src/lib/scheduling/recommendations";

// rank-slots.ts is DB-free (see its module comment), so this is a plain
// static import with no DATABASE_URL dance needed.

function slot(overrides: Partial<SchedulingRecommendation> = {}): SchedulingRecommendation {
  return {
    date: "2026-07-09", // a Thursday
    arrivalWindowStartTime: "09:00:00",
    arrivalWindowEndTime: "09:30:00",
    employeeIds: ["maria"],
    employeeNames: ["Maria G"],
    crewSize: 1,
    totalJthMinutes: 120,
    expectedWallClockMinutes: 120,
    expectedFinishTime: "11:00:00",
    reasonCodes: [],
    explanations: [],
    warnings: [],
    ...overrides,
  };
}

function profile(overrides: Partial<CustomerSchedulingProfile> = {}): CustomerSchedulingProfile {
  return {
    customerId: "cust-1",
    sampleSize: 8,
    lastVisit: null,
    typicalGapDays: null,
    expectedGapDays: null,
    nextDueDate: null,
    usualWeekdays: [4], // Thursday
    usualWeekdayShare: 0.75,
    usualWindow: "morning",
    usualWindowShare: 0.75,
    medianStartTime: "09:00:00",
    regularCrew: [{ userId: "maria", firstName: "Maria", lastName: "G", visits: 8, workedLastVisit: true }],
    medianActualMinutes: null,
    durationDriftFactor: null,
    cancellationRate: 0,
    stated: { preferredCleanerId: null, preferredWeekday: null, preferredWindow: null },
    ...overrides,
  };
}

test("a zero-history customer gets a single NO_HISTORY signal and zero confidence, never throwing", () => {
  const zeroHistory = profile({ sampleSize: 0, usualWeekdays: [], usualWeekdayShare: 0, usualWindow: null, usualWindowShare: 0, medianStartTime: null, regularCrew: [] });
  const [ranked] = rankSlots([slot()], zeroHistory);
  assert.deepEqual(ranked.signals, [{ code: "NO_HISTORY", weight: 0, evidence: "First visit — no past visits to go on yet." }]);
  assert.equal(ranked.confidence, 0);
  assert.equal(ranked.score, 0);
  assert.deepEqual(ranked.proximity, { nearestStopMiles: null, nearestStopCustomerName: null, stopsNearby: 0 });
});

test("a slot on the customer's usual day fires USUAL_DAY scaled by the share, not OFF_USUAL_DAY", () => {
  const [ranked] = rankSlots([slot({ date: "2026-07-09" })], profile()); // Thursday
  const codes = ranked.signals.map((signal) => signal.code);
  assert.ok(codes.includes("USUAL_DAY"));
  assert.ok(!codes.includes("OFF_USUAL_DAY"));
  const usualDay = ranked.signals.find((signal) => signal.code === "USUAL_DAY")!;
  assert.equal(usualDay.weight, 2.25); // 3 * 0.75
  assert.match(usualDay.evidence, /6 of the last 8 visits were on a Thursday/);
});

test("OFF_USUAL_DAY fires when the slot misses every usual weekday", () => {
  const [ranked] = rankSlots([slot({ date: "2026-07-13" })], profile()); // a Monday, not Thursday
  const codes = ranked.signals.map((signal) => signal.code);
  assert.ok(codes.includes("OFF_USUAL_DAY"));
  assert.ok(!codes.includes("USUAL_DAY"));
  const offDay = ranked.signals.find((signal) => signal.code === "OFF_USUAL_DAY")!;
  assert.equal(offDay.weight, -2);
});

test("REGULAR_CREW and LAST_CREW both fire for a crew member who is regular and worked last time", () => {
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"], crewSize: 1 })], profile());
  const codes = ranked.signals.map((signal) => signal.code);
  assert.ok(codes.includes("REGULAR_CREW"));
  assert.ok(codes.includes("LAST_CREW"));
});

test("NEW_CREW fires when nobody on the slot has cleaned here before but the customer has history", () => {
  const [ranked] = rankSlots([slot({ employeeIds: ["stranger"], employeeNames: ["Someone New"] })], profile());
  const codes = ranked.signals.map((signal) => signal.code);
  assert.ok(codes.includes("NEW_CREW"));
  assert.ok(!codes.includes("REGULAR_CREW"));
  assert.ok(!codes.includes("LAST_CREW"));
});

test("STATED_PREFERENCE fires when the slot matches a hand-set field", () => {
  const withPreference = profile({ stated: { preferredCleanerId: "maria", preferredWeekday: null, preferredWindow: null } });
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"] })], withPreference);
  assert.ok(ranked.signals.some((signal) => signal.code === "STATED_PREFERENCE" && signal.weight === 2));
});

test("DURATION_CORRECTED reports the corrected minutes and the direction of the drift", () => {
  const withDrift = profile({ durationDriftFactor: 1.2 });
  const [ranked] = rankSlots([slot({ totalJthMinutes: 144 })], withDrift); // 120 * 1.2 = 144
  const corrected = ranked.signals.find((signal) => signal.code === "DURATION_CORRECTED");
  assert.ok(corrected);
  assert.equal(corrected!.weight, 0);
  assert.match(corrected!.evidence, /24 minutes longer/);
  assert.match(corrected!.evidence, /2h 24m/);
});

test("feasibility order is never touched by ranking — a better-matching slot sorts first", () => {
  const usualThursday = slot({ date: "2026-07-09", employeeIds: ["maria"], crewSize: 1 });
  const offDayNewCrew = slot({ date: "2026-07-13", employeeIds: ["stranger"], employeeNames: ["Someone New"], crewSize: 1 });
  const ranked = rankSlots([offDayNewCrew, usualThursday], profile());
  assert.equal(ranked[0].date, "2026-07-09");
  assert.ok(ranked[0].score > ranked[1].score);
});

// ---- Requirement 1: TOO_SOON ----

test("TOO_SOON fires (weight -5) when a slot lands well before nextDueDate, naming days-ago and the cadence", () => {
  const monthlyProfile = profile({
    lastVisit: { jobId: "job-0", date: "2026-08-22", daysAgo: 4, employees: [{ userId: "maria", firstName: "Maria", lastName: "G" }] },
    typicalGapDays: null,
    expectedGapDays: 30,
    nextDueDate: "2026-09-21", // 2026-08-22 + 30
  });
  const [ranked] = rankSlots([slot({ date: "2026-08-26" })], monthlyProfile); // 26 days before nextDueDate
  const tooSoon = ranked.signals.find((signal) => signal.code === "TOO_SOON");
  assert.ok(tooSoon, "expected TOO_SOON to fire");
  assert.equal(tooSoon!.weight, -5);
  assert.match(tooSoon!.evidence, /Cleaned 4 days ago/);
  assert.match(tooSoon!.evidence, /monthly service/);
  assert.match(tooSoon!.evidence, /Sep 21/);
});

test("TOO_SOON respects a 2-day tolerance — one day early is not flagged, three days early is", () => {
  const base = profile({
    lastVisit: { jobId: "job-0", date: "2026-08-01", daysAgo: 10, employees: [] },
    expectedGapDays: 14,
    nextDueDate: "2026-08-15",
  });

  const oneDayEarly = rankSlots([slot({ date: "2026-08-14" })], base)[0];
  assert.ok(!oneDayEarly.signals.some((signal) => signal.code === "TOO_SOON"));

  const threeDaysEarly = rankSlots([slot({ date: "2026-08-12" })], base)[0];
  assert.ok(threeDaysEarly.signals.some((signal) => signal.code === "TOO_SOON"));
});

test("TOO_SOON does not fire on or after the due date", () => {
  const base = profile({ lastVisit: { jobId: "job-0", date: "2026-08-01", daysAgo: 10, employees: [] }, expectedGapDays: 14, nextDueDate: "2026-08-15" });
  const onDue = rankSlots([slot({ date: "2026-08-15" })], base)[0];
  assert.ok(!onDue.signals.some((signal) => signal.code === "TOO_SOON"));
  const afterDue = rankSlots([slot({ date: "2026-08-20" })], base)[0];
  assert.ok(!afterDue.signals.some((signal) => signal.code === "TOO_SOON"));
});

// ---- Requirement 2: proximity ----

test("haversineMiles matches a known distance — downtown Tulsa to downtown Bartlesville is about 45 miles", () => {
  const tulsa = { latitude: 36.1540, longitude: -95.9928 };
  const bartlesville = { latitude: 36.7473, longitude: -95.9808 };
  const miles = haversineMiles(tulsa, bartlesville);
  assert.ok(miles > 40 && miles < 50, `expected roughly 45 miles, got ${miles}`);
});

test("haversineMiles is zero for identical coordinates", () => {
  const point = { latitude: 36.15, longitude: -95.99 };
  assert.equal(haversineMiles(point, point), 0);
});

test("NEARBY_WORK fires (scaled toward full weight near 0 miles) and names the neighbour", () => {
  const target = { latitude: 36.1000, longitude: -95.9000 };
  const nearNeighbor = { latitude: 36.1015, longitude: -95.9000 }; // ~0.1 miles north — well inside the radius
  const stop: ProximityStop = { jobId: "job-2", customerName: "Ruiz", employeeIds: ["maria"], latitude: nearNeighbor.latitude, longitude: nearNeighbor.longitude };
  const stopsByDate = new Map([["2026-07-09", [stop]]]);
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"], employeeNames: ["Maria G"] })], profile(), { targetCoordinates: target, stopsByDate });

  assert.ok(ranked.proximity.nearestStopMiles != null && ranked.proximity.nearestStopMiles < 5);
  assert.equal(ranked.proximity.nearestStopCustomerName, "Ruiz");
  const nearby = ranked.signals.find((signal) => signal.code === "NEARBY_WORK");
  assert.ok(nearby);
  assert.ok(nearby!.weight > 0 && nearby!.weight <= 2);
  assert.match(nearby!.evidence, /Maria is already cleaning the Ruiz home/);
});

test("LONG_DRIVE fires as a flat -1 caveat when the crew's nearest stop is far away", () => {
  const target = { latitude: 36.10, longitude: -95.90 };
  const farStop: ProximityStop = { jobId: "job-3", customerName: "Owens", employeeIds: ["maria"], latitude: 36.60, longitude: -95.90 }; // >30 miles north
  const stopsByDate = new Map([["2026-07-09", [farStop]]]);
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"] })], profile(), { targetCoordinates: target, stopsByDate });

  const longDrive = ranked.signals.find((signal) => signal.code === "LONG_DRIVE");
  assert.ok(longDrive);
  assert.equal(longDrive!.weight, -1);
  assert.ok(!ranked.signals.some((signal) => signal.code === "NEARBY_WORK"));
});

test("missing coordinates never fabricate a distance — null proximity, no signal, even with other stops on the books", () => {
  const stop: ProximityStop = { jobId: "job-4", customerName: "Ruiz", employeeIds: ["maria"], latitude: 36.10, longitude: -95.90 };
  const stopsByDate = new Map([["2026-07-09", [stop]]]);

  // Case 1: this address was never geocoded (no targetCoordinates at all).
  const [ungeocodedTarget] = rankSlots([slot({ employeeIds: ["maria"] })], profile(), { targetCoordinates: null, stopsByDate });
  assert.deepEqual(ungeocodedTarget.proximity, { nearestStopMiles: null, nearestStopCustomerName: null, stopsNearby: 0 });
  assert.ok(!ungeocodedTarget.signals.some((signal) => signal.code === "NEARBY_WORK" || signal.code === "LONG_DRIVE"));

  // Case 2: this address is geocoded but the crew's only other stop that day isn't.
  const target = { latitude: 36.10, longitude: -95.90 };
  const ungeocodedStop: ProximityStop = { ...stop, latitude: null, longitude: null };
  const [ungeocodedNeighbor] = rankSlots([slot({ employeeIds: ["maria"] })], profile(), { targetCoordinates: target, stopsByDate: new Map([["2026-07-09", [ungeocodedStop]]]) });
  assert.deepEqual(ungeocodedNeighbor.proximity, { nearestStopMiles: null, nearestStopCustomerName: null, stopsNearby: 0 });
  assert.ok(!ungeocodedNeighbor.signals.some((signal) => signal.code === "NEARBY_WORK" || signal.code === "LONG_DRIVE"));
});

test("proximity only counts stops assigned to this slot's own crew, not every job that day", () => {
  const target = { latitude: 36.10, longitude: -95.90 };
  const otherCrewStop: ProximityStop = { jobId: "job-5", customerName: "Not This Crew", employeeIds: ["someone-else"], latitude: 36.1005, longitude: -95.90 };
  const stopsByDate = new Map([["2026-07-09", [otherCrewStop]]]);
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"] })], profile(), { targetCoordinates: target, stopsByDate });
  assert.deepEqual(ranked.proximity, { nearestStopMiles: null, nearestStopCustomerName: null, stopsNearby: 0 });
});

test("proximity is excluded from confidence — a nearby stop alone does not raise confidence for a zero-history customer", () => {
  const zeroHistory = profile({ sampleSize: 0, usualWeekdays: [], usualWeekdayShare: 0, usualWindow: null, usualWindowShare: 0, medianStartTime: null, regularCrew: [] });
  const target = { latitude: 36.10, longitude: -95.90 };
  const stop: ProximityStop = { jobId: "job-6", customerName: "Ruiz", employeeIds: ["maria"], latitude: 36.1005, longitude: -95.90 };
  const [ranked] = rankSlots([slot({ employeeIds: ["maria"] })], zeroHistory, { targetCoordinates: target, stopsByDate: new Map([["2026-07-09", [stop]]]) });
  assert.equal(ranked.confidence, 0); // still zero — proximity isn't history.
  assert.ok(ranked.signals.some((signal) => signal.code === "NO_HISTORY"));
  assert.ok(ranked.signals.some((signal) => signal.code === "NEARBY_WORK")); // but the operational fact still surfaces.
});
