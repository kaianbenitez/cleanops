// Client-side shapes for the job detail screen. The server component in
// `page.tsx` loads these from the DB and serialises timestamps to ISO strings
// before handing them across the client boundary, so every field here is
// JSON-primitive.

export type Employee = { id: string; firstName: string; lastName: string; isActive?: boolean };

export type Assignment = { id: string; userId: string; role: string };

export type JobDetail = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  jthManualOverride: boolean;
  priceCents: number;
  completionNotes: string | null;
  paymentMethodCollected: string | null;
  checkNumberCollected: string | null;
  cleanerNotes: string | null;
  cancellationReason: string | null;
  serviceId: string | null;
  serviceName: string | null;
  addOnNames: string[];
  customerId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type TimeEntry = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  clockIn: string;
  clockOut: string | null;
  minutesWorked: number | null;
  recordedByAdmin: boolean;
  notes: string | null;
};

export type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  editorFirstName: string | null;
  editorLastName: string | null;
};

/** Card chrome shared by every panel in the dispatch layout. */
export const CARD_CLASS = "rounded-2xl border border-[#cad6ca] bg-white p-5 shadow-[0_2px_6px_rgba(18,33,27,0.04)]";

export const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

/** Matches `jobPaymentMethodEnum` in src/db/schema.ts. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  check: "Check",
  credit_card: "Credit card",
  not_collected: "Not collected on-site",
  other: "Other",
};

export function readableError(body: { error?: unknown }) {
  if (!body.error) return "Something went wrong. Please try again.";
  return typeof body.error === "string" ? body.error : JSON.stringify(body.error);
}

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatEstimatedTime(minutes: number | null) {
  if (!minutes) return "duration pending";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** ISO timestamp -> the `YYYY-MM-DDTHH:mm` a `datetime-local` input expects, in local time. */
export function toDateTimeInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
