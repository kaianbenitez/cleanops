import { cleanNoteText } from "@/lib/format";

type AddressLike = {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type NotesLike = {
  generalNotes?: string | null;
  accessInstructions: string | null;
  keyNumber: string | null;
  garageCode: string | null;
  gateCode: string | null;
  alarmCode: string | null;
  vacuumLocation: string | null;
  mopHeadsNeeded: string | null;
  trashBags: string | null;
  preferredDays?: string[] | null;
  preferredTimeOfDay?: string | null;
  subdivision: string | null;
};

/** Matches "HH:MM" or "HH:MM:SS" with no date/timezone — what Postgres `time`
 * columns (e.g. jobs.scheduledStartTime) come back as. `new Date()` can't
 * parse that on its own and returns Invalid Date, so it needs an arbitrary
 * anchor date first. */
const BARE_TIME = /^\d{2}:\d{2}(:\d{2})?$/;

export function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(BARE_TIME.test(value) ? `1970-01-01T${value}` : value);
  return Number.isNaN(date.getTime()) ? "Time not set" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dateLabel(value: string, timezone: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "Date not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function jobAddress(job: AddressLike) {
  return [job.addressLine1, job.city, job.state, job.zip].filter(Boolean).join(", ");
}

/**
 * General notes and the key/garage/gate/alarm codes each already get their own
 * dedicated spot (the "Client notes" callout and the masked Access row) —
 * repeating them here as plain grid boxes was the "everything looks the same"
 * clutter this list used to produce. This only covers the leftover
 * operational details that don't have a home of their own yet.
 */
export function groupNotes(job: NotesLike) {
  return [
    job.accessInstructions ? `Access: ${cleanNoteText(job.accessInstructions)}` : null,
    job.vacuumLocation ? `Vacuum: ${job.vacuumLocation}` : null,
    job.mopHeadsNeeded ? `Mop heads: ${job.mopHeadsNeeded}` : null,
    job.trashBags ? `Trash bags: ${job.trashBags}` : null,
    job.preferredDays?.length ? `Preferred days: ${job.preferredDays.join(", ")}` : null,
    job.preferredTimeOfDay ? `Preferred time: ${job.preferredTimeOfDay}` : null,
    job.subdivision ? `Subdivision: ${job.subdivision}` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function customerProfile(job: NotesLike) {
  return [
    { label: "Preferred days", value: job.preferredDays?.join(", ") ?? "Not set" },
    { label: "Preferred time", value: job.preferredTimeOfDay ?? "Not set" },
    { label: "Subdivision", value: job.subdivision ?? "Not set" },
    { label: "General notes", value: job.generalNotes ?? "No general notes" },
    { label: "Access notes", value: job.accessInstructions ?? "No access notes" },
  ];
}

export function formatElapsed(startedAt: string | number | null, now: number) {
  if (!startedAt || !now) return "00:00";
  const start = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt;
  if (Number.isNaN(start)) return "00:00";
  const totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** hh:mm, matching the Jobs list / Job Detail / Calendar convention. */
export function formatEstimatedTime(minutes: number | null | undefined) {
  if (!minutes) return "Est. pending";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function jobTypeLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Matches `jobPaymentMethodEnum` in src/db/schema.ts — kept as a labeled list
 * (not just title-cased) so the "nothing collected on-site" option can read
 * as a real sentence instead of "Not Collected". */
export const PAYMENT_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "not_collected", label: "Not collected on-site" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
];

export function paymentMethodLabel(value: string | null | undefined) {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label ?? "Not set";
}
