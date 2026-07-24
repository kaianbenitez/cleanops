export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  clientType: string;
  companyName?: string | null;
  salutation?: string | null;
  customerNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  textMessagingAllowed?: boolean;
  source?: string | null;
  preferredDays?: string[] | null;
  preferredCleanerId?: string | null;
  preferredTimeOfDay?: "AM" | "PM" | null;
  paymentMethods?: string[] | null;
  generalNotes?: string | null;
  recurrence?: string | null;
  homeDetails?: Record<string, unknown>;
  tags?: unknown;
  gateCodeOrKeyNotes?: string | null;
  petNotes?: string | null;
  importantToCustomer?: string | null;
  operationalNotes?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
  archivedReason?: string | null;
};

export type Location = {
  id?: string;
  label: string;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  subdivision?: string | null;
  accessInstructions?: string | null;
  keyNumber?: string | null;
  garageCode?: string | null;
  gateCode?: string | null;
  alarmCode?: string | null;
  vacuumLocation?: string | null;
  mopHeadsNeeded?: string | null;
  trashBags?: string | null;
  googlePlaceId?: string | null;
};

export type CustomerJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  priceCents: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  editorFirstName: string | null;
  editorLastName: string | null;
};

export const STATUS_STYLES: Record<string, string> = {
  lead: "border-slate-200 bg-slate-50 text-slate-600",
  quoted: "border-blue-200 bg-blue-50 text-blue-700",
  first_clean_booked: "border-amber-200 bg-amber-50 text-amber-700",
  client: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-rose-200 bg-rose-50 text-rose-700",
  moved: "border-slate-200 bg-slate-50 text-slate-400",
};

export const TYPE_LABELS: Record<string, string> = {
  first_clean: "First clean",
  recurring: "Recurring",
  one_time: "One-time",
  deep_clean: "Deep clean",
  move_out: "Move in/out",
};

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
