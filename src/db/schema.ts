import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

// ---------- companies ----------
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Chicago"),
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

// ---------- users (mirrors supabase auth uid) ----------
export const roleEnum = ["admin", "employee"] as const;
// commission_jth: cleaning techs — paid Job Ticket Hours (the job's quoted/
//   estimated duration) x hourlyRateCents, per completed job, regardless of
//   actual clocked time.
// office_hourly: office/admin staff — paid actual clocked hours x hourlyRateCents.
export const payTypeEnum = ["commission_jth", "office_hourly"] as const;

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // matches supabase auth uid
  companyId: uuid("company_id").notNull().references(() => companies.id),
  role: text("role", { enum: roleEnum }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email").notNull(), // login identity — `<username>@cleanops.local`, see src/lib/auth/username.ts
  contactEmail: text("contact_email"), // real personal email, display/contact only, no auth meaning
  // Month/day only (MM-DD). The production database intentionally does not
  // retain a birth year.
  birthday: text("birthday"),
  hiredDate: date("hired_date"),
  title: text("title"), // Gusto job title, e.g. "Cleaning Tech (Primary)"
  gustoEmployeeId: text("gusto_employee_id"), // for CSV export matching
  // Flat rate. Used directly for office_hourly employees. For commission_jth
  // employees, only a fallback when payTiers is null/empty — normally
  // payTiers determines the rate instead (see below).
  hourlyRateCents: integer("hourly_rate_cents"),
  payType: text("pay_type", { enum: payTypeEnum }),
  // commission_jth employees only: per-employee tiered rate schedule, keyed
  // by total weekly Job Ticket Hours (confirmed against a real payroll
  // example: "Budgeted Hrs" = sum of that week's job durations, and the
  // resulting per-job pay used ONE tier's rate for every job that week, not
  // a graduated/marginal rate). Shape: [{ minHours, maxHours: number|null,
  // rateCents }, ...], sorted ascending, maxHours null = no upper bound.
  // ASSUMPTION (unconfirmed with the owner): tier schedules are
  // per-employee, not company-wide — inferred because two employees in the
  // source spreadsheet showed different tier numbers. Verify before relying
  // on this for a real payroll run.
  payTiers: jsonb("pay_tiers"),
  // Which service location (e.g. Bartlesville vs. Tulsa) this person primarily
  // works out of. Cleaning techs generally stick to one area rather than
  // cross-driving between them. Nullable — not every employee has this set.
  serviceLocationId: uuid("service_location_id").references(() => serviceLocations.id),
  // Storage object path in the private employee-photos bucket.
  profilePhotoUrl: text("profile_photo_url"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => ({
  companyIdx: index("users_company_idx").on(t.companyId),
}));

// ---------- employee PTO ----------
export const ptoPeriodEnum = ["full", "morning", "afternoon"] as const;

/** Admin-managed availability exceptions. Interior dates in a range are full
 * days; start/end periods support half-day PTO at either boundary. */
export const employeePto = pgTable("employee_pto", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  startPeriod: text("start_period", { enum: ptoPeriodEnum }).notNull().default("full"),
  endPeriod: text("end_period", { enum: ptoPeriodEnum }).notNull().default("full"),
  note: text("note"),
  ...timestamps,
}, (t) => ({
  userDateIdx: index("employee_pto_user_date_idx").on(t.userId, t.startDate, t.endDate),
  companyDateIdx: index("employee_pto_company_date_idx").on(t.companyId, t.startDate, t.endDate),
}));

// ---------- customers ----------
export const customerStatusEnum = [
  "lead",
  "quoted",
  "first_clean_booked",
  "client",
  "lost",
  "moved",
] as const;
export const recurrenceEnum = ["none", "weekly", "biweekly", "every4weeks", "monthly"] as const;
export const clientTypeEnum = ["residential", "commercial"] as const;

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  ghlContactId: text("ghl_contact_id"),
  squareCustomerId: text("square_customer_id"),
  customerNumber: text("customer_number"),
  salutation: text("salutation"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  county: text("county"),
  subdivision: text("subdivision"),
  gateCodeOrKeyNotes: text("gate_code_or_key_notes"),
  preferredCommunication: text("preferred_communication"),
  preferredDay: text("preferred_day"),
  preferredTime: text("preferred_time"),
  preferredDays: text("preferred_days").array(),
  preferredCleanerId: uuid("preferred_cleaner_id").references(() => users.id),
  preferredTimeOfDay: text("preferred_time_of_day", { enum: ["AM", "PM"] as const }),
  serviceType: text("service_type"),
  paymentMethod: text("payment_method"),
  paymentMethods: text("payment_methods").array(),
  importantToCustomer: text("important_to_customer"),
  doNotClean: text("do_not_clean"),
  petNotes: text("pet_notes"),
  homeDetails: jsonb("home_details").notNull().default({}),
  operationalNotes: text("operational_notes"),
  tags: jsonb("tags").notNull().default([]),
  textMessagingAllowed: boolean("text_messaging_allowed").notNull().default(false),
  status: text("status", { enum: customerStatusEnum }).notNull().default("lead"),
  clientType: text("client_type", { enum: clientTypeEnum }).notNull().default("residential"),
  recurrence: text("recurrence", { enum: recurrenceEnum }),
  source: text("source"),
  notes: text("notes"),
  generalNotes: text("general_notes"),
  // NOTE: archivedAt/archivedReason were dropped in 0011_plain_freak.sql as dead/write-only
  // columns tied to customers.status (0 non-null rows, never read). These are a deliberate
  // reintroduction under the same names for a different feature — hiding non-recurring
  // one-time customers from the working list — this time actually read by the list/profile
  // UI. See DECISIONS.md 2026-07-24 (drop) and this session's entry (reintroduction).
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedReason: text("archived_reason"),
  ...timestamps,
}, (t) => ({
  companyIdx: index("customers_company_idx").on(t.companyId),
  ghlContactIdx: uniqueIndex("customers_ghl_contact_idx").on(t.ghlContactId),
  archivedIdx: index("customers_archived_idx").on(t.companyId, t.isArchived),
}));

// A customer may have more than one service location. The first location is
// copied from the legacy customer address fields for a gradual migration.
export const customerLocations = pgTable("customer_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  label: text("label").notNull().default("Primary home"),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  county: text("county"),
  subdivision: text("subdivision"),
  googlePlaceId: text("google_place_id"),
  isPrimary: boolean("is_primary").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  accessInstructions: text("access_instructions"),
  keyNumber: text("key_number"),
  garageCode: text("garage_code"),
  gateCode: text("gate_code"),
  alarmCode: text("alarm_code"),
  vacuumLocation: text("vacuum_location"),
  mopHeadsNeeded: text("mop_heads_needed"),
  trashBags: text("trash_bags"),
  ...timestamps,
}, (t) => ({
  customerIdx: index("customer_locations_customer_idx").on(t.customerId),
  companyIdx: index("customer_locations_company_idx").on(t.companyId),
}));

// ---------- services ----------
export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  defaultPriceCents: integer("default_price_cents").notNull(),
  defaultDurationMinutes: integer("default_duration_minutes").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// ---------- pricing engine (room-count based quote calculator) ----------
// Reverse-engineered from the company's real "Quote Form" spreadsheet
// (2 location tabs: Bartlesville $42/hr, Tulsa $50/hr). Room-type service
// weights (hours per room per service tier) and the dirty-code discount
// table were confirmed IDENTICAL across both locations — only hourly rate,
// service minimums, and travel-zone fees differ per location. Formula:
//   roomSubtotal = SUM(weightHours[room][serviceType] * hourlyRateCents * count[room])
//   raw = roomSubtotal + travelZone.feeCents
//   discounted = round(raw * (1 + dirtyCodeTier.discountPercent))
//   final = MAX(discounted, minimums[serviceType])   <- ASSUMPTION: the source
//     sheet computes the raw price but never actually applies its own
//     "Minimum" row as a floor (confirmed by reading the formula, not just
//     values). Auto-enforcing it here was an explicit choice, not a default.
// NOT modeled (found in the sheet but out of the user-approved v1 scope):
// a "CC Fee" surcharge (~3.75%) applied when paying by card.
export const serviceTypeEnum = [
  "supreme_deep",
  "deep",
  "first_time",
  "weekly",
  "biweekly",
  "four_weeks",
  "move_in_out",
] as const;

export const serviceLocations = pgTable("service_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(), // e.g. "Bartlesville", "Tulsa"
  hourlyRateCents: integer("hourly_rate_cents").notNull(),
  // { [serviceType]: minimumCents }
  minimums: jsonb("minimums").notNull().default({}),
  // [{ level: number, discountPercent: number (negative = discount) }]
  dirtyCodeTiers: jsonb("dirty_code_tiers").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const travelZones = pgTable("travel_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceLocationId: uuid("service_location_id").notNull().references(() => serviceLocations.id),
  name: text("name").notNull(), // town name or zip code, per the source sheet
  feeCents: integer("fee_cents").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const roomTypes = pgTable("room_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(), // "Bedrooms", "Master Bathroom", ...
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Hours-per-room weight for one room type x one service tier. Shared across
 * every location in the company (confirmed identical between Bartlesville
 * and Tulsa) — if that ever stops being true, add serviceLocationId here. */
export const roomTypeServiceWeights = pgTable("room_type_service_weights", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomTypeId: uuid("room_type_id").notNull().references(() => roomTypes.id),
  serviceType: text("service_type", { enum: serviceTypeEnum }).notNull(),
  weightHours: numeric("weight_hours", { precision: 6, scale: 3 }).notNull(),
  ...timestamps,
}, (t) => ({
  roomServiceIdx: uniqueIndex("room_type_service_weights_idx").on(t.roomTypeId, t.serviceType),
}));

// ---------- quotes ----------
export const quoteStatusEnum = ["draft", "sent", "viewed", "accepted", "declined", "expired"] as const;

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  status: text("status", { enum: quoteStatusEnum }).notNull().default("draft"),
  publicToken: text("public_token").notNull(),

  // Room-count pricing engine inputs/outputs — see the block comment above.
  // The quote computes ALL 7 service-tier prices from the same room counts
  // (matching the source spreadsheet's real behavior and the company's real
  // TCF proposal, which lets the customer pick from multiple priced options
  // rather than the admin pre-selecting one tier before sending).
  serviceLocationId: uuid("service_location_id").references(() => serviceLocations.id),
  requestedServiceType: text("requested_service_type", { enum: serviceTypeEnum }), // admin's suggested/default tier
  acceptedServiceType: text("accepted_service_type", { enum: serviceTypeEnum }), // set when the customer accepts
  // When a customer accepts a one-time visit and also opts into an ongoing
  // cadence, keep that separately from the visit they accepted. The scheduler
  // can then set its start date deliberately rather than losing the consent.
  acceptedRecurringServiceType: text("accepted_recurring_service_type", { enum: serviceTypeEnum }),
  travelZoneId: uuid("travel_zone_id").references(() => travelZones.id),
  dirtyCodeLevel: integer("dirty_code_level"), // 1-4, matches serviceLocations.dirtyCodeTiers[].level
  roomCounts: jsonb("room_counts").notNull().default([]), // [{ roomTypeId, count }]
  allTierPricing: jsonb("all_tier_pricing"), // { [serviceType]: PricingBreakdown }, computed at creation

  signatureName: text("signature_name"), // typed-name e-signature, set on accept
  signatureAt: timestamp("signature_at", { withTimezone: true }),

  acceptedAddOns: jsonb("accepted_add_ons").notNull().default([]), // AddOnKey[] the customer picked on accept — see lib/pricing/add-ons.ts
  totalCents: integer("total_cents").notNull().default(0),
  notesToCustomer: text("notes_to_customer"),
  validUntil: date("valid_until"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  publicTokenIdx: uniqueIndex("quotes_public_token_idx").on(t.publicToken),
  companyIdx: index("quotes_company_idx").on(t.companyId),
}));

// ---------- recurring series ----------
export const frequencyEnum = ["weekly", "biweekly", "every4weeks", "monthly"] as const;

export const recurringSeries = pgTable("recurring_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  frequency: text("frequency", { enum: frequencyEnum }).notNull(),
  dayOfWeek: integer("day_of_week"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  priceCents: integer("price_cents").notNull(),
  // Kept on the series so every generated visit retains the quote-derived
  // schedule budget instead of falling back to a generic duration.
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  defaultEmployeeIds: jsonb("default_employee_ids").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// ---------- jobs ----------
export const jobTypeEnum = ["first_clean", "recurring", "one_time", "deep_clean", "move_out"] as const;
export const jobStatusEnum = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  quoteId: uuid("quote_id").references(() => quotes.id),
  type: text("type", { enum: jobTypeEnum }).notNull(),
  status: text("status", { enum: jobStatusEnum }).notNull().default("scheduled"),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledStartTime: time("scheduled_start_time"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  priceCents: integer("price_cents").notNull(),
  recurringSeriesId: uuid("recurring_series_id").references(() => recurringSeries.id),
  completionNotes: text("completion_notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  companyDateIdx: index("jobs_company_date_idx").on(t.companyId, t.scheduledDate),
  seriesDateIdx: uniqueIndex("jobs_series_date_idx").on(t.recurringSeriesId, t.scheduledDate),
}));

// ---------- job assignments ----------
export const assignmentRoleEnum = ["lead", "helper"] as const;

export const jobAssignments = pgTable("job_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role", { enum: assignmentRoleEnum }).notNull().default("lead"),
  ...timestamps,
}, (t) => ({
  jobUserIdx: uniqueIndex("job_assignments_job_user_idx").on(t.jobId, t.userId),
  userIdx: index("job_assignments_user_idx").on(t.userId),
}));

// ---------- time entries ----------
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  minutesWorked: integer("minutes_worked"),
  editedByAdmin: boolean("edited_by_admin").notNull().default(false),
  recordedByAdmin: boolean("recorded_by_admin").notNull().default(false),
  notes: text("notes"),
  ...timestamps,
}, (t) => ({
  jobIdx: index("time_entries_job_idx").on(t.jobId),
  userIdx: index("time_entries_user_idx").on(t.userId),
}));

// ---------- invoices ----------
export const invoiceStatusEnum = ["draft", "sent", "paid", "void"] as const;
export const invoiceMethodEnum = ["square", "check", "cash", "other"] as const;

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  jobId: uuid("job_id").references(() => jobs.id),
  status: text("status", { enum: invoiceStatusEnum }).notNull().default("draft"),
  method: text("method", { enum: invoiceMethodEnum }),
  squareInvoiceId: text("square_invoice_id"),
  subtotalCents: integer("subtotal_cents"),
  discountCents: integer("discount_cents").notNull().default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  checkNumber: text("check_number"),
  paymentNote: text("payment_note"),
  ...timestamps,
}, (t) => ({
  companyStatusIdx: index("invoices_company_status_idx").on(t.companyId, t.status),
  jobIdx: index("invoices_job_idx").on(t.jobId),
}));

// ---------- payroll ----------
export const payrollPeriodStatusEnum = ["open", "reviewed", "exported"] as const;

export const payrollPeriods = pgTable("payroll_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status", { enum: payrollPeriodStatusEnum }).notNull().default("open"),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  ...timestamps,
});

// ---------- job photos ----------
export const jobPhotoSlotEnum = ["before", "after", "extra"] as const;

export const jobPhotos = pgTable("job_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id),
  storagePath: text("storage_path").notNull(),
  slot: text("slot", { enum: jobPhotoSlotEnum }).notNull().default("extra"),
  caption: text("caption"),
  ...timestamps,
}, (t) => ({
  jobCreatedIdx: index("job_photos_job_created_idx").on(t.jobId, t.createdAt),
  companyIdx: index("job_photos_company_idx").on(t.companyId),
  storagePathIdx: uniqueIndex("job_photos_storage_path_idx").on(t.storagePath),
}));

/**
 * One row per employee per payroll period. Columns mirror the company's real
 * weekly payroll sheet (Table 1: summary) and feed the Gusto CSV export
 * (Table 2 in that sheet: last_name, first_name, title, gusto_employee_id,
 * regular_hours, bonus, commission, paycheck_tips, cash_tips, ...).
 *
 * commissionCents (cleaning techs) = sum over the period's completed jobs of
 * (job.estimatedDurationMinutes / 60 * user.hourlyRateCents) — Job Ticket
 * Hours x rate, paid on the quote regardless of actual clocked time.
 * officeHours / officePayCents (office/admin staff) = actual clocked hours
 * from time_entries x user.hourlyRateCents.
 * mileageCents, tipsPaycheckCents, tipsCashCents, bonusCents, trainingCents,
 * payrollAdvanceCents are manual entries — no automated source exists yet.
 */
export const payrollLines = pgTable("payroll_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  payrollPeriodId: uuid("payroll_period_id").notNull().references(() => payrollPeriods.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  jobsCount: integer("jobs_count").notNull().default(0),
  regularHours: numeric("regular_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  commissionCents: integer("commission_cents").notNull().default(0),
  officeHours: numeric("office_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  officePayCents: integer("office_pay_cents").notNull().default(0),
  mileageMiles: numeric("mileage_miles", { precision: 8, scale: 2 }).notNull().default("0"),
  mileageRateCents: integer("mileage_rate_cents").notNull().default(35), // $0.35/mi default, matches sheet
  mileageCents: integer("mileage_cents").notNull().default(0),
  tipsPaycheckCents: integer("tips_paycheck_cents").notNull().default(0),
  tipsCashCents: integer("tips_cash_cents").notNull().default(0),
  bonusCents: integer("bonus_cents").notNull().default(0),
  teamLeadBonusCents: integer("team_lead_bonus_cents").notNull().default(0),
  trainerBonusCents: integer("trainer_bonus_cents").notNull().default(0),
  trainingCents: integer("training_cents").notNull().default(0),
  payrollAdvanceCents: integer("payroll_advance_cents").notNull().default(0), // deduction, stored positive
  gustoNetPayCents: integer("gusto_net_pay_cents"), // optional manual reference after Gusto review
  calculation: jsonb("calculation").notNull().default([]), // per-job breakdown for commissionCents
  adjustmentCents: integer("adjustment_cents").notNull().default(0), // manual catch-all correction
  adjustmentNote: text("adjustment_note"),
  finalCents: integer("final_cents").notNull().default(0),
  ...timestamps,
}, (t) => ({
  periodUserIdx: uniqueIndex("payroll_lines_period_user_idx").on(t.payrollPeriodId, t.userId),
}));

// ---------- ghl sync log ----------
export const syncDirectionEnum = ["inbound", "outbound"] as const;
export const syncStatusEnum = ["ok", "failed", "retrying"] as const;

export const ghlSyncLog = pgTable("ghl_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  direction: text("direction", { enum: syncDirectionEnum }).notNull(),
  eventType: text("event_type").notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  payload: jsonb("payload").notNull().default({}),
  response: jsonb("response"),
  status: text("status", { enum: syncStatusEnum }).notNull().default("retrying"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  ...timestamps,
}, (t) => ({
  companyStatusIdx: index("ghl_sync_log_company_status_idx").on(t.companyId, t.status),
}));

// ---------- webhook events (raw inbox) ----------
export const webhookSourceEnum = ["ghl", "square"] as const;

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source", { enum: webhookSourceEnum }).notNull(),
  payload: jsonb("payload").notNull(),
  signatureValid: boolean("signature_valid").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  ...timestamps,
}, (t) => ({
  sourceProcessedIdx: index("webhook_events_source_idx").on(t.source, t.processedAt),
}));

// ---------- audit log ----------
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ...timestamps,
}, (t) => ({
  companyCreatedIdx: index("audit_log_company_created_idx").on(t.companyId, t.createdAt),
}));

// ---------- relations ----------
export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  customers: many(customers),
  customerLocations: many(customerLocations),
  services: many(services),
  jobs: many(jobs),
  employeePto: many(employeePto),
}));

export const employeePtoRelations = relations(employeePto, ({ one }) => ({
  company: one(companies, { fields: [employeePto.companyId], references: [companies.id] }),
  user: one(users, { fields: [employeePto.userId], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
  locations: many(customerLocations),
  quotes: many(quotes),
  jobs: many(jobs),
  invoices: many(invoices),
}));

export const customerLocationsRelations = relations(customerLocations, ({ one }) => ({
  company: one(companies, { fields: [customerLocations.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [customerLocations.customerId], references: [customers.id] }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
  quote: one(quotes, { fields: [jobs.quoteId], references: [quotes.id] }),
  series: one(recurringSeries, { fields: [jobs.recurringSeriesId], references: [recurringSeries.id] }),
  assignments: many(jobAssignments),
  timeEntries: many(timeEntries),
}));

export const jobAssignmentsRelations = relations(jobAssignments, ({ one }) => ({
  job: one(jobs, { fields: [jobAssignments.jobId], references: [jobs.id] }),
  user: one(users, { fields: [jobAssignments.userId], references: [users.id] }),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
}));

export const payrollPeriodsRelations = relations(payrollPeriods, ({ many }) => ({
  lines: many(payrollLines),
}));

export const payrollLinesRelations = relations(payrollLines, ({ one }) => ({
  period: one(payrollPeriods, { fields: [payrollLines.payrollPeriodId], references: [payrollPeriods.id] }),
  user: one(users, { fields: [payrollLines.userId], references: [users.id] }),
}));
