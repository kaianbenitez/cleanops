/**
 * Shared contract between the scheduling assistant's server side (job memory +
 * ranked slots) and the Calendar UI that renders it.
 *
 * Nothing here touches the database or React on purpose — both halves of the
 * feature import these types, so the contract stays the single place where the
 * shape of a suggestion is decided.
 *
 * Vocabulary note: the product never calls this "AI" or "smart scheduling".
 * Every suggestion has to be able to state, in one plain sentence, the history
 * it came from — see `evidence` below. If a signal cannot be explained that
 * way, it does not belong in the ranking.
 */

/** A weekday, 0 = Sunday, matching Date#getUTCDay and companies.settings.workingDays. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BookingWindowKey = "morning" | "afternoon";

/** One member of a customer's regular crew, with how much of their recent
 * history that person actually covers. */
export type RegularCrewMember = {
  userId: string;
  firstName: string;
  lastName: string;
  /** Completed visits this person worked, out of `CustomerSchedulingProfile.sampleSize`. */
  visits: number;
  /** True when this person worked the most recent completed visit. */
  workedLastVisit: boolean;
};

/** The most recent completed visit, and how long ago it was. This is the
 * single most decision-changing fact when placing a job: a monthly customer
 * cleaned four days ago should not be booked again this week, however many
 * crews happen to be free. */
export type LastVisit = {
  jobId: string;
  date: string;
  /** Whole days between that visit and today, in the company's time zone. */
  daysAgo: number;
  employees: { userId: string; firstName: string; lastName: string }[];
};

/**
 * What the system has learned about one customer from their own completed
 * visits. Derived, never authored — the hand-set fields on `customers`
 * (preferredCleanerId, preferredDay, preferredTimeOfDay) stay authoritative
 * and are reported separately so the UI can show when history disagrees with
 * what someone typed in.
 */
export type CustomerSchedulingProfile = {
  customerId: string;
  /** Completed, non-cancelled visits the profile was built from. */
  sampleSize: number;
  /** Null when nothing has ever been completed here. */
  lastVisit: LastVisit | null;
  /** Median days between consecutive completed visits — what this customer's
   * cadence actually is, as opposed to what it was sold as. Null until there
   * are at least three completed visits to measure two gaps from. */
  typicalGapDays: number | null;
  /** Days between visits implied by the booked cadence (weekly 7, biweekly
   * 14, every 4 weeks 28, monthly 30, custom N×7). Null for one-off work. */
  expectedGapDays: number | null;
  /** The date the next visit is actually due: `lastVisit.date` plus whichever
   * of the two gaps above is known, preferring the measured one. Null when
   * either side is unknown. Slots before this are booked too soon. */
  nextDueDate: string | null;
  /** Most common weekday(s) across the sample, most common first. Empty when
   * no weekday holds a clear plurality. */
  usualWeekdays: Weekday[];
  /** Share of the sample falling on `usualWeekdays[0]`, 0..1. */
  usualWeekdayShare: number;
  /** Most common arrival window, or null when the split is even. */
  usualWindow: BookingWindowKey | null;
  /** Share of the sample in `usualWindow`, 0..1. */
  usualWindowShare: number;
  /** Median scheduled start across the sample, "HH:MM:SS". Null when unknown. */
  medianStartTime: string | null;
  /** People who have actually cleaned here, most frequent first. */
  regularCrew: RegularCrewMember[];
  /** Median real labor minutes from time entries, summed per visit across the
   * crew so it is comparable to jobs.estimatedDurationMinutes (total JTH).
   * Null when too few visits have complete clock-in/clock-out pairs. */
  medianActualMinutes: number | null;
  /** medianActualMinutes / median estimate. >1 means visits here consistently
   * run long. Null when medianActualMinutes is null. */
  durationDriftFactor: number | null;
  /** Cancelled or no-show visits as a share of all scheduled visits, 0..1. */
  cancellationRate: number;
  /** Hand-set fields on the customer record, for comparison against the above. */
  stated: {
    preferredCleanerId: string | null;
    preferredWeekday: Weekday | null;
    preferredWindow: BookingWindowKey | null;
  };
};

/** Why one slot ranked where it did. Each code must map to exactly one
 * sentence of `evidence` in the same order. */
export type SlotSignalCode =
  | "USUAL_DAY"
  | "USUAL_WINDOW"
  | "REGULAR_CREW"
  | "LAST_CREW"
  | "STATED_PREFERENCE"
  | "DURATION_CORRECTED"
  | "OFF_USUAL_DAY"
  | "NEW_CREW"
  /** The slot falls before `nextDueDate` — this customer was cleaned too
   * recently for the cadence they're on. Weighted hard enough to sink a slot
   * that is otherwise perfect, because it is an operational mistake rather
   * than a preference miss, and it is the case where the right answer is
   * often to skip the visit instead of placing it. */
  | "TOO_SOON"
  /** The crew on this slot already has a stop that day close to this address,
   * so taking it adds little driving. Distances are straight-line, in miles —
   * see `SlotProximity`. */
  | "NEARBY_WORK"
  /** The crew's nearest other stop that day is far from this address. A
   * caveat, never a blocker: sometimes the long drive is the only option. */
  | "LONG_DRIVE"
  | "NO_HISTORY";

export type SlotSignal = {
  code: SlotSignalCode;
  /** Signed contribution to `score`. Negative codes read as caveats in the UI. */
  weight: number;
  /** One plain sentence naming the history behind it. Written for a dispatcher
   * to read aloud: "Her regular day — 6 of the last 8 visits were Thursday." */
  evidence: string;
};

/**
 * How much driving this slot adds for the crew that would take it.
 *
 * Distances are straight-line miles from cached customer coordinates
 * (`customers.geocoded_latitude` / `_longitude`) — deliberately not routed
 * drive times, which would mean a paid API call per candidate slot. Straight
 * line is accurate enough to answer the only question being asked here: is
 * this stop clustered with the crew's other work, or stranded away from it?
 *
 * Every field is null when either address has never been geocoded. The UI
 * must then say nothing about distance rather than implying zero.
 */
export type SlotProximity = {
  /** Straight-line miles to the crew's closest other stop that day, or null
   * when they have no other stop, or when coordinates are missing. */
  nearestStopMiles: number | null;
  /** Who that closest stop is, for a sentence a dispatcher can say aloud. */
  nearestStopCustomerName: string | null;
  /** The crew's stops that day within `NEARBY_RADIUS_MILES` of this address. */
  stopsNearby: number;
};

/** A job near the one being placed, so nearby work can be batched onto the
 * same crew and day instead of being driven to separately. */
export type NearbyJob = {
  jobId: string;
  customerName: string;
  addressLine1: string | null;
  city: string | null;
  scheduledDate: string;
  scheduledStartTime: string | null;
  status: string;
  /** Straight-line miles from the job being placed. */
  miles: number;
  /** Empty when nobody is assigned yet — which is exactly the case worth
   * batching, so the UI should surface these first. */
  assignedNames: string[];
};

/** Slots at or under this many straight-line miles from the crew's other work
 * count as clustered. Roughly a ten-minute suburban drive. */
export const NEARBY_RADIUS_MILES = 5;

/** Beyond this, the slot earns a LONG_DRIVE caveat. */
export const LONG_DRIVE_MILES = 15;

/**
 * A feasible slot that has passed every hard constraint in
 * getSchedulingRecommendations, then been ranked against the customer's own
 * history. Feasibility and ranking stay separate on purpose: history never
 * promotes a slot that breaks PTO, travel buffer, or the workday cutoff.
 */
export type RankedSlot = {
  date: string;
  arrivalWindowStartTime: string;
  arrivalWindowEndTime: string;
  employeeIds: string[];
  employeeNames: string[];
  crewSize: number;
  /** Total labor minutes this slot was planned against — already corrected by
   * `durationDriftFactor` when `DURATION_CORRECTED` is present. */
  totalJthMinutes: number;
  expectedWallClockMinutes: number;
  expectedFinishTime: string;
  /** Sum of signal weights. Comparable only within one response. */
  score: number;
  /** How much history backs this slot, 0..1. Drives the confidence spine in
   * the UI. A brand-new customer legitimately scores near 0 — that is
   * information, not a failure, and the UI says so. */
  confidence: number;
  signals: SlotSignal[];
  /** Driving added by this slot. Always present; its fields are null when the
   * addresses involved have no cached coordinates. */
  proximity: SlotProximity;
  /** Hard-constraint notes carried through from the feasibility pass. */
  warnings: string[];
};

/**
 * What the Calendar is asking for. Two mutually exclusive forms:
 *
 * - `jobId` — "find a slot for this existing job". Everything else (customer,
 *   branch, service type, labor minutes) is derived from the job row, and the
 *   job's own time is excluded from conflict checks so it never blocks itself.
 *   **All three Calendar intents use this form**, including `assign`: a job
 *   sitting in the unassigned queue is already a job row.
 *
 * - `customerId` — "place a visit that has no job row yet", for callers
 *   outside the Calendar. A bare customer row does not imply how long the work
 *   takes or where it is, so this form must also carry `totalJthMinutes`,
 *   `serviceType`, and `serviceLocationId`; the server rejects it with a 400
 *   when any are missing.
 */
export type SlotRequest = {
  jobId?: string;
  customerId?: string;
  /** Required with `customerId`, ignored with `jobId`. Total labor minutes
   * (JTH), not wall-clock — see wall-clock.ts. */
  totalJthMinutes?: number;
  /** Required with `customerId`, ignored with `jobId`. */
  serviceType?: string;
  /** Required with `customerId`, ignored with `jobId`. The branch whose staff
   * are eligible for the work. */
  serviceLocationId?: string;
  startDate: string;
  endDate: string;
  /** Overrides the customer's learned window when they asked for one on the
   * phone. Defaults to the learned `usualWindow` when omitted. */
  preferredWindow?: BookingWindowKey | null;
};

export type SlotResponse = {
  slots: RankedSlot[];
  profile: CustomerSchedulingProfile;
  /** Other jobs close to this address inside the requested range, nearest
   * first. Lets a dispatcher batch neighbouring work onto one crew and one
   * day instead of driving out twice. Empty when this address has no cached
   * coordinates. */
  nearbyJobs: NearbyJob[];
  /** Set when no slot in the range cleared the hard constraints, so the UI can
   * explain the dead end instead of rendering an empty list. */
  emptyReason?: "no_working_days" | "no_eligible_staff" | "fully_booked";
};

/** The three places the slot finder opens from. The panel is one component;
 * only the verb changes. */
export type SlotFinderIntent = "assign" | "reschedule" | "rebook";
