type AddressLike = {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type NotesLike = {
  accessInstructions: string | null;
  keyNumber: string | null;
  garageCode: string | null;
  gateCode: string | null;
  alarmCode: string | null;
  vacuumLocation: string | null;
  mopHeadsNeeded: string | null;
  trashBags: string | null;
  importantToCustomer: string | null;
  doNotClean: string | null;
  petNotes: string | null;
  operationalNotes: string | null;
  preferredCommunication: string | null;
  preferredDay: string | null;
  preferredTime: string | null;
  subdivision: string | null;
};

export function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
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

export function groupNotes(job: NotesLike) {
  return [
    job.accessInstructions,
    job.keyNumber ? `Key #: ${job.keyNumber}` : null,
    job.garageCode ? `Garage: ${job.garageCode}` : null,
    job.gateCode ? `Gate: ${job.gateCode}` : null,
    job.alarmCode ? `Alarm: ${job.alarmCode}` : null,
    job.vacuumLocation ? `Vacuum: ${job.vacuumLocation}` : null,
    job.mopHeadsNeeded ? `Mop heads: ${job.mopHeadsNeeded}` : null,
    job.trashBags ? `Trash bags: ${job.trashBags}` : null,
    job.importantToCustomer ? `Important: ${job.importantToCustomer}` : null,
    job.doNotClean ? `Do not clean: ${job.doNotClean}` : null,
    job.petNotes ? `Pets: ${job.petNotes}` : null,
    job.operationalNotes ? job.operationalNotes : null,
    job.preferredCommunication ? `Prefers ${job.preferredCommunication}` : null,
    job.preferredDay ? `Prefers ${job.preferredDay}` : null,
    job.preferredTime ? `Prefers ${job.preferredTime}` : null,
    job.subdivision ? `Subdivision: ${job.subdivision}` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function customerProfile(job: NotesLike) {
  return [
    { label: "Preferred communication", value: job.preferredCommunication ?? "Not set" },
    { label: "Preferred day", value: job.preferredDay ?? "Not set" },
    { label: "Preferred time", value: job.preferredTime ?? "Not set" },
    { label: "Subdivision", value: job.subdivision ?? "Not set" },
    { label: "Pets", value: job.petNotes ?? "None noted" },
    { label: "Important to customer", value: job.importantToCustomer ?? "Not noted" },
    { label: "Do not clean", value: job.doNotClean ?? "None noted" },
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

export function jobTypeLabel(type: string) {
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
