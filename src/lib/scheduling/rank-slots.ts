/**
 * Reorders and annotates the feasible slots `getSchedulingRecommendations`
 * already produced, using one customer's own history (`job-memory.ts`) and,
 * optionally, how close each slot's crew would already be that day
 * (proximity — see the third parameter of `rankSlots`). Feasibility is never
 * overridden here — this module only sorts and explains what already
 * cleared the hard constraints.
 *
 * Every signal ships a one-sentence `evidence` string a dispatcher could read
 * aloud on the phone, citing real numbers from the profile — never "AI",
 * "smart", "algorithm", "predicted", or "score". See slot-contract.ts.
 */
import type { CustomerSchedulingProfile, RankedSlot, SlotProximity, SlotSignal, SlotSignalCode, Weekday, BookingWindowKey } from "./slot-contract";
import { NEARBY_RADIUS_MILES, LONG_DRIVE_MILES } from "./slot-contract";
import type { SchedulingRecommendation } from "./recommendations";
import { timeToMinutes } from "./wall-clock";

/** Deliberately duplicated from job-memory.ts's identical helpers (rather
 * than imported) so this module stays free of any DB-touching import and is
 * safe to pull into a test file with zero setup. */
function classifyWindow(startTime: string): BookingWindowKey {
  return timeToMinutes(startTime) < 12 * 60 ? "morning" : "afternoon";
}

function toUtcDayNumber(dateISO: string): number {
  const [year, month, day] = dateISO.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(toUtcDayNumber(toISO) - toUtcDayNumber(fromISO));
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** How many days early a slot may land before `nextDueDate` without being
 * flagged — a visit landing a day ahead of schedule is normal slack, not a
 * mistake. */
const TOO_SOON_TOLERANCE_DAYS = 2;

// Proximity (NEARBY_WORK/LONG_DRIVE) answers "does taking this slot add
// driving for the crew" — a fact about the map, not about this customer's
// history. It deliberately does NOT count toward confidence, which is "how
// much do we know about this customer" per slot-contract.ts's RankedSlot
// doc comment; a stranger's house happening to sit next to today's route
// says nothing about whether we know this customer's habits. TOO_SOON is
// data-dependent (needs lastVisit) but negative, so it was never a
// candidate for the *positive*-match denominator either way.
const POSITIVE_CODES: SlotSignalCode[] = ["USUAL_DAY", "USUAL_WINDOW", "REGULAR_CREW", "LAST_CREW", "STATED_PREFERENCE"];

function weekdayOf(dateISO: string): Weekday {
  return new Date(`${dateISO}T00:00:00.000Z`).getUTCDay() as Weekday;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDurationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatFriendlyDate(dateISO: string): string {
  const [, month, day] = dateISO.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${day}`;
}

function cadenceLabel(days: number): string {
  if (days === 7) return "a weekly service";
  if (days === 14) return "a biweekly service";
  if (days === 28) return "a four-week service";
  if (days === 30) return "a monthly service";
  return `a ${days}-day cadence`;
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} miles`;
}

// ---------------------------------------------------------------------------
// Proximity
// ---------------------------------------------------------------------------

export type GeoPoint = { latitude: number; longitude: number };

/** Straight-line distance in miles (haversine) — deliberately not a routed
 * drive time, which would mean a paid Maps API call per candidate slot. See
 * SlotProximity's doc comment in slot-contract.ts. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const EARTH_RADIUS_MILES = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** One other job on the calendar that day, as far as proximity needs to know
 * about it — who's assigned (to match against a slot's crew) and where it
 * is (null coordinates when never geocoded). */
export type ProximityStop = {
  jobId: string;
  customerName: string;
  employeeIds: string[];
  latitude: number | null;
  longitude: number | null;
};

/** Everything rankSlots needs to score proximity, precomputed by the caller
 * (route.ts) so this module stays free of DB access. Omit entirely for a
 * caller that doesn't have proximity data — every slot then gets null
 * proximity fields and no NEARBY_WORK/LONG_DRIVE signal, same as a slot
 * whose address was never geocoded. */
export type ProximityInputs = {
  /** The job/customer being placed. Null when never geocoded. */
  targetCoordinates: GeoPoint | null;
  /** Other jobs in the requested range, keyed by scheduledDate. */
  stopsByDate: Map<string, ProximityStop[]>;
};

const EMPTY_PROXIMITY_INPUTS: ProximityInputs = { targetCoordinates: null, stopsByDate: new Map() };

function computeProximity(rec: SchedulingRecommendation, proximityInputs: ProximityInputs): SlotProximity {
  const { targetCoordinates, stopsByDate } = proximityInputs;
  if (!targetCoordinates) return { nearestStopMiles: null, nearestStopCustomerName: null, stopsNearby: 0 };

  const stopsThatDay = stopsByDate.get(rec.date) ?? [];
  const distances = stopsThatDay
    .filter((stop) => stop.employeeIds.some((id) => rec.employeeIds.includes(id)))
    .filter((stop): stop is ProximityStop & { latitude: number; longitude: number } => stop.latitude != null && stop.longitude != null)
    .map((stop) => ({ stop, miles: haversineMiles(targetCoordinates, { latitude: stop.latitude, longitude: stop.longitude }) }))
    .sort((a, b) => a.miles - b.miles);

  const nearest = distances[0] ?? null;
  return {
    nearestStopMiles: nearest ? round2(nearest.miles) : null,
    nearestStopCustomerName: nearest ? nearest.stop.customerName : null,
    stopsNearby: distances.filter((entry) => entry.miles <= NEARBY_RADIUS_MILES).length,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function toRankedSlot(rec: SchedulingRecommendation, signals: SlotSignal[], confidence: number, proximity: SlotProximity): RankedSlot {
  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  return {
    date: rec.date,
    arrivalWindowStartTime: rec.arrivalWindowStartTime,
    arrivalWindowEndTime: rec.arrivalWindowEndTime,
    employeeIds: rec.employeeIds,
    employeeNames: rec.employeeNames,
    crewSize: rec.crewSize,
    totalJthMinutes: rec.totalJthMinutes,
    expectedWallClockMinutes: rec.expectedWallClockMinutes,
    expectedFinishTime: rec.expectedFinishTime,
    score,
    confidence,
    signals,
    proximity,
    warnings: rec.warnings,
  };
}

function proximitySignals(rec: SchedulingRecommendation, proximity: SlotProximity): SlotSignal[] {
  const signals: SlotSignal[] = [];
  if (proximity.nearestStopMiles == null || !proximity.nearestStopCustomerName) return signals;

  const miles = proximity.nearestStopMiles;
  const crewFirstName = rec.employeeNames[0]?.split(" ")[0] ?? "The crew";
  const windowWord = classifyWindow(rec.arrivalWindowStartTime) === "morning" ? "morning" : "afternoon";

  if (miles <= NEARBY_RADIUS_MILES) {
    // Full weight at 0 miles, tapering linearly to 0 right at the radius.
    const weight = round2(2 * (1 - miles / NEARBY_RADIUS_MILES));
    signals.push({
      code: "NEARBY_WORK",
      weight,
      evidence: `${crewFirstName} is already cleaning the ${proximity.nearestStopCustomerName} home ${formatMiles(miles)} away that ${windowWord}.`,
    });
  } else if (miles >= LONG_DRIVE_MILES) {
    signals.push({
      code: "LONG_DRIVE",
      weight: -1,
      evidence: `${crewFirstName}'s nearest other stop that day is ${formatMiles(miles)} away.`,
    });
  }
  return signals;
}

function rankOne(rec: SchedulingRecommendation, profile: CustomerSchedulingProfile, proximityInputs: ProximityInputs): RankedSlot {
  const proximity = computeProximity(rec, proximityInputs);
  const proxSignals = proximitySignals(rec, proximity);

  // A brand-new customer legitimately has nothing to compare against — one
  // flat history signal, zero confidence (confidence is specifically "how
  // much do we know about this customer"). Proximity isn't about the
  // customer's history, so it still gets a fair say even here.
  if (profile.sampleSize === 0) {
    return toRankedSlot(rec, [{ code: "NO_HISTORY", weight: 0, evidence: "First visit — no past visits to go on yet." }, ...proxSignals], 0, proximity);
  }

  const signals: SlotSignal[] = [];
  const weekday = weekdayOf(rec.date);
  const window = classifyWindow(rec.arrivalWindowStartTime);
  const weekdayName = WEEKDAY_NAMES[weekday];

  if (profile.usualWeekdays.includes(weekday)) {
    // `usualWeekdayShare` describes the TOP weekday only, so a visit count is
    // only citable when this slot lands on that day. On a secondary usual day
    // the sentence stays true by not claiming a number it can't back.
    const isTopWeekday = profile.usualWeekdays[0] === weekday;
    const count = Math.round(profile.usualWeekdayShare * profile.sampleSize);
    signals.push({
      code: "USUAL_DAY",
      weight: round2(3 * profile.usualWeekdayShare),
      evidence: isTopWeekday
        ? `The regular day — ${count} of the last ${profile.sampleSize} visits were on a ${weekdayName}.`
        : `A regular day here — ${weekdayName} is one of the ${profile.usualWeekdays.length} this customer is usually booked on.`,
    });
  } else if (profile.usualWeekdays.length > 0) {
    const usualNames = profile.usualWeekdays.map((day) => WEEKDAY_NAMES[day]).join(" or ");
    signals.push({ code: "OFF_USUAL_DAY", weight: -2, evidence: `Not the usual day — this customer is normally booked ${usualNames}.` });
  }

  if (profile.usualWindow && window === profile.usualWindow) {
    const count = Math.round(profile.usualWindowShare * profile.sampleSize);
    const label = profile.usualWindow === "morning" ? "before noon" : "in the afternoon";
    signals.push({
      code: "USUAL_WINDOW",
      weight: round2(2 * profile.usualWindowShare),
      evidence: `Usually booked ${label} — ${count} of the last ${profile.sampleSize} visits started that way.`,
    });
  }

  const regularsOnCrew = rec.employeeIds
    .map((id) => profile.regularCrew.find((member) => member.userId === id))
    .filter((member): member is CustomerSchedulingProfile["regularCrew"][number] => Boolean(member));

  if (regularsOnCrew.length > 0) {
    const share = regularsOnCrew.length / rec.crewSize;
    const top = [...regularsOnCrew].sort((a, b) => b.visits - a.visits || Number(b.workedLastVisit) - Number(a.workedLastVisit))[0];
    const lastVisitMemberForClause = regularsOnCrew.find((member) => member.workedLastVisit);
    // LAST_CREW states the "worked the last visit" fact in its own sentence, so
    // only fold it into REGULAR_CREW when LAST_CREW won't fire for this same
    // person — otherwise the disclosure reads the fact out twice.
    const lastVisitClause = top.workedLastVisit && lastVisitMemberForClause?.userId !== top.userId ? ", including the last visit" : "";
    signals.push({
      code: "REGULAR_CREW",
      weight: round2(2 * share),
      evidence: `${top.firstName} has cleaned here ${top.visits} time${top.visits === 1 ? "" : "s"}${lastVisitClause}.`,
    });
    const lastVisitMember = regularsOnCrew.find((member) => member.workedLastVisit);
    if (lastVisitMember) {
      signals.push({ code: "LAST_CREW", weight: 1, evidence: `${lastVisitMember.firstName} was on the crew for the last visit too.` });
    }
  } else {
    signals.push({ code: "NEW_CREW", weight: -1, evidence: "None of this crew has cleaned here before." });
  }

  const statedMatches: string[] = [];
  if (profile.stated.preferredCleanerId && rec.employeeIds.includes(profile.stated.preferredCleanerId)) statedMatches.push("the requested cleaner");
  if (profile.stated.preferredWeekday != null && profile.stated.preferredWeekday === weekday) statedMatches.push(`the requested day (${weekdayName})`);
  if (profile.stated.preferredWindow && profile.stated.preferredWindow === window) statedMatches.push("the requested time of day");
  if (statedMatches.length > 0) {
    signals.push({ code: "STATED_PREFERENCE", weight: 2, evidence: `Matches ${statedMatches.join(" and ")} on file.` });
  }

  // The route corrects totalJthMinutes by durationDriftFactor *before*
  // calling getSchedulingRecommendations (correcting after would leave a
  // slot's feasibility checked against the wrong duration). To report what
  // changed here without a third parameter, invert that same factor.
  if (profile.durationDriftFactor != null) {
    const originalEstimate = Math.round(rec.totalJthMinutes / profile.durationDriftFactor);
    const delta = rec.totalJthMinutes - originalEstimate;
    if (Math.abs(delta) >= 1) {
      const direction = delta > 0 ? "longer" : "shorter";
      signals.push({
        code: "DURATION_CORRECTED",
        weight: 0,
        evidence: `Visits here run about ${Math.abs(delta)} minutes ${direction} than the estimate, so this slot is planned at ${formatDurationLabel(rec.totalJthMinutes)}.`,
      });
    }
  }

  // TOO_SOON: this customer was cleaned too recently for the cadence
  // they're on. Independent of every other check above — a slot can be the
  // customer's usual Thursday morning with the regular crew and still be
  // wrong to book, because it's simply too early.
  if (profile.lastVisit && profile.nextDueDate) {
    const daysEarly = daysBetween(rec.date, profile.nextDueDate);
    if (daysEarly > TOO_SOON_TOLERANCE_DAYS) {
      const gapDays = profile.typicalGapDays ?? profile.expectedGapDays;
      const cadence = gapDays != null ? cadenceLabel(Math.round(gapDays)) : "their usual cadence";
      const daysAgo = profile.lastVisit.daysAgo;
      signals.push({
        code: "TOO_SOON",
        weight: -5,
        evidence: `Cleaned ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago and they're on ${cadence} — not due again until ${formatFriendlyDate(profile.nextDueDate)}.`,
      });
    }
  }

  signals.push(...proxSignals);

  const matchedPositiveCount = signals.filter((signal) => POSITIVE_CODES.includes(signal.code)).length;
  const sampleDepth = Math.min(1, profile.sampleSize / 8);
  const matchRatio = matchedPositiveCount / POSITIVE_CODES.length;
  const confidence = Math.min(1, Math.max(0, (sampleDepth + matchRatio) / 2));

  return toRankedSlot(rec, signals, confidence, proximity);
}

/** Pure: reorders `recommendations` (already feasible) by how well each one
 * matches `profile`'s history — plus, when `proximityInputs` is supplied,
 * how much driving it adds for that slot's crew — best first. Ties break by
 * confidence, then chronologically, so the result is stable across repeated
 * calls. Omitting `proximityInputs` (or passing no coordinates) is
 * equivalent to every address being ungeocoded: null proximity, no
 * NEARBY_WORK/LONG_DRIVE signal. */
export function rankSlots(recommendations: SchedulingRecommendation[], profile: CustomerSchedulingProfile, proximityInputs: ProximityInputs = EMPTY_PROXIMITY_INPUTS): RankedSlot[] {
  return recommendations
    .map((rec) => rankOne(rec, profile, proximityInputs))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.confidence - a.confidence ||
        a.date.localeCompare(b.date) ||
        a.arrivalWindowStartTime.localeCompare(b.arrivalWindowStartTime)
    );
}
