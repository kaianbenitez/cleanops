/**
 * Outbound GHL sync orchestrator — the single place CleanOps state changes
 * become GHL API calls. Every call is logged to ghl_sync_log (attempts,
 * status, response) so failures are visible and retryable, per PLAN.md §6/§8.
 *
 * Tag names are read from companies.settings.ghlTagMap (jsonb), never
 * hardcoded — GHL workflows reference these exact strings, so they must be
 * admin-configurable to match whatever the real GHL account actually uses.
 */
import { db } from "@/db";
import { companies, customers, ghlSyncLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addContactToWorkflow, addTags, removeTags, setCustomFields, upsertContact } from "./client";

export type GhlTagMap = {
  quoteGiven: string;
  quoteAccepted: string;
  firstCleanBooked: string;
  firstCleanDone: string;
  client: string;
  lost: string;
  moved: string;
};

export type GhlWorkflowMap = {
  newLead: string;
  quoteSent: string;
  quoteViewed: string;
  quoteAccepted: string;
  firstCleanBooked: string;
  firstCleanCompleted: string;
  client: string;
  lost: string;
  moved: string;
};

const DEFAULT_TAG_MAP: GhlTagMap = {
  quoteGiven: "quote-given",
  quoteAccepted: "quote-accepted",
  firstCleanBooked: "first-clean-booked",
  firstCleanDone: "first-clean-done",
  client: "client",
  lost: "lost",
  moved: "moved",
};

const DEFAULT_WORKFLOW_MAP: GhlWorkflowMap = {
  newLead: "",
  quoteSent: "",
  quoteViewed: "",
  quoteAccepted: "",
  firstCleanBooked: "",
  firstCleanCompleted: "",
  client: "",
  lost: "",
  moved: "",
};

export type GhlSyncEvent =
  | { type: "quote.sent"; customerId: string; quoteUrl: string }
  | { type: "quote.viewed"; customerId: string; quoteUrl: string; viewedAt: string }
  | { type: "quote.accepted"; customerId: string }
  | { type: "first_clean.scheduled"; customerId: string; scheduledDate: string }
  | { type: "first_clean.completed"; customerId: string }
  | { type: "customer.became_client"; customerId: string; recurrence: string }
  | { type: "customer.lost"; customerId: string }
  | { type: "customer.moved"; customerId: string }
  | {
      type: "customer.updated";
      customerId: string;
      firstName: string;
      lastName: string;
      email?: string | null;
      phone?: string | null;
      address1?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
    };

async function getTagMap(companyId: string): Promise<GhlTagMap> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const settings = (company?.settings as { ghlTagMap?: Partial<GhlTagMap> }) ?? {};
  return { ...DEFAULT_TAG_MAP, ...settings.ghlTagMap };
}

async function getWorkflowMap(companyId: string): Promise<GhlWorkflowMap> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const settings = (company?.settings as { ghlWorkflowMap?: Partial<GhlWorkflowMap> }) ?? {};
  return { ...DEFAULT_WORKFLOW_MAP, ...settings.ghlWorkflowMap };
}

type Customer = typeof customers.$inferSelect;

/** Returns the customer's GHL contact id, creating the contact on GHL (and
 * persisting the id) on first sync. Shared by both the immediate sync path
 * and the retry cron so contact-resolution logic lives in exactly one place. */
async function resolveGhlContactId(customer: Customer): Promise<string> {
  if (customer.ghlContactId) return customer.ghlContactId;

  const locationId = process.env.GHL_LOCATION_ID ?? "mock-location";
  const upsertRes = await upsertContact({
    locationId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
  });
  if (!upsertRes.ok) throw new Error(`Contact upsert failed: ${JSON.stringify(upsertRes.body)}`);

  const body = upsertRes.body as { contact?: { id?: string }; mock?: boolean };
  const ghlContactId = body.mock ? `mock-${customer.id}` : body.contact?.id;
  if (!ghlContactId) throw new Error("No GHL contact id available after upsert");

  await db.update(customers).set({ ghlContactId }).where(eq(customers.id, customer.id));
  return ghlContactId;
}

/** Runs one sync event end-to-end: resolve contact, apply the tag/field
 * changes for the event type, and record the ok/error outcome on the given
 * log row. Shared by the immediate sync path and the retry cron. */
async function runSync(logId: string, companyId: string, event: GhlSyncEvent, attemptNumber: number): Promise<void> {
  try {
    const [customer] = await db.select().from(customers).where(eq(customers.id, event.customerId)).limit(1);
    if (!customer) throw new Error("Customer not found");

    const [ghlContactId, tagMap, workflowMap] = await Promise.all([resolveGhlContactId(customer), getTagMap(companyId), getWorkflowMap(companyId)]);
    const results = await applyEvent(ghlContactId, event, tagMap, workflowMap);

    await db
      .update(ghlSyncLog)
      .set({ status: "ok", response: results, attempts: attemptNumber, lastAttemptAt: new Date() })
      .where(eq(ghlSyncLog.id, logId));
  } catch (err) {
    await db
      .update(ghlSyncLog)
      .set({
        status: "retrying",
        response: { error: err instanceof Error ? err.message : String(err) },
        attempts: attemptNumber,
        lastAttemptAt: new Date(),
      })
      .where(eq(ghlSyncLog.id, logId));
  }
}

/**
 * Fires one outbound sync event immediately. Never throws — failures are
 * recorded as 'retrying' for the cron to pick up, so a GHL outage never
 * blocks the CleanOps action that triggered it (job creation, quote
 * acceptance, etc.).
 */
export async function syncToGhl(companyId: string, event: GhlSyncEvent): Promise<void> {
  const [row] = await db
    .insert(ghlSyncLog)
    .values({
      companyId,
      direction: "outbound",
      eventType: event.type,
      customerId: event.customerId,
      payload: event,
      status: "retrying",
    })
    .returning({ id: ghlSyncLog.id });

  await runSync(row.id, companyId, event, 1);
}

function applyEvent(ghlContactId: string, event: GhlSyncEvent, tagMap: GhlTagMap, workflowMap: GhlWorkflowMap): Promise<unknown[]> {
  switch (event.type) {
    case "quote.sent":
      return Promise.all([
        addTags(ghlContactId, [tagMap.quoteGiven]),
        setCustomFields(ghlContactId, { quote_url: event.quoteUrl }),
        workflowMap.quoteSent ? addContactToWorkflow(ghlContactId, workflowMap.quoteSent) : Promise.resolve(null),
      ]);
    case "quote.viewed":
      return Promise.all([
        setCustomFields(ghlContactId, { quote_url: event.quoteUrl, quote_viewed_at: event.viewedAt }),
        workflowMap.quoteViewed ? addContactToWorkflow(ghlContactId, workflowMap.quoteViewed) : Promise.resolve(null),
      ]);
    case "quote.accepted":
      return Promise.all([
        addTags(ghlContactId, [tagMap.quoteAccepted]),
        removeTags(ghlContactId, [tagMap.quoteGiven]),
        workflowMap.quoteAccepted ? addContactToWorkflow(ghlContactId, workflowMap.quoteAccepted) : Promise.resolve(null),
      ]);
    case "first_clean.scheduled":
      return Promise.all([
        addTags(ghlContactId, [tagMap.firstCleanBooked]),
        setCustomFields(ghlContactId, { first_cleaning_date: event.scheduledDate }),
        workflowMap.firstCleanBooked ? addContactToWorkflow(ghlContactId, workflowMap.firstCleanBooked) : Promise.resolve(null),
      ]);
    case "first_clean.completed":
      return Promise.all([
        addTags(ghlContactId, [tagMap.firstCleanDone]),
        workflowMap.firstCleanCompleted ? addContactToWorkflow(ghlContactId, workflowMap.firstCleanCompleted) : Promise.resolve(null),
      ]);
    case "customer.became_client":
      return Promise.all([
        addTags(ghlContactId, [tagMap.client, `recurrence-${event.recurrence}`]),
        removeTags(ghlContactId, [tagMap.quoteGiven, tagMap.quoteAccepted, tagMap.firstCleanBooked]),
        workflowMap.client ? addContactToWorkflow(ghlContactId, workflowMap.client) : Promise.resolve(null),
      ]);
    case "customer.lost":
      return Promise.all([
        addTags(ghlContactId, [tagMap.lost]),
        removeTags(ghlContactId, [tagMap.quoteGiven, tagMap.quoteAccepted, tagMap.firstCleanBooked, tagMap.client]),
        workflowMap.lost ? addContactToWorkflow(ghlContactId, workflowMap.lost) : Promise.resolve(null),
      ]);
    case "customer.moved":
      return Promise.all([
        addTags(ghlContactId, [tagMap.moved]),
        removeTags(ghlContactId, [tagMap.quoteGiven, tagMap.quoteAccepted, tagMap.firstCleanBooked, tagMap.client]),
        workflowMap.moved ? addContactToWorkflow(ghlContactId, workflowMap.moved) : Promise.resolve(null),
      ]);
    case "customer.updated":
      return Promise.all([
        upsertContact({
          ghlContactId,
          locationId: process.env.GHL_LOCATION_ID ?? "mock-location",
          firstName: event.firstName,
          lastName: event.lastName,
          email: event.email ?? null,
          phone: event.phone ?? null,
          address1: event.address1 ?? null,
          city: event.city ?? null,
          state: event.state ?? null,
          postalCode: event.postalCode ?? null,
        }),
      ]);
  }
}

/** Retries every 'retrying' sync under the attempt cap. Called by the cron route. */
export async function retryFailedSyncs(maxAttempts = 5): Promise<{ retried: number }> {
  const pending = await db.select().from(ghlSyncLog).where(eq(ghlSyncLog.status, "retrying"));

  let retried = 0;
  for (const row of pending) {
    if (row.attempts >= maxAttempts) {
      await db.update(ghlSyncLog).set({ status: "failed" }).where(eq(ghlSyncLog.id, row.id));
      continue;
    }
    if (!row.customerId) continue;

    retried++;
    await runSync(row.id, row.companyId, row.payload as GhlSyncEvent, row.attempts + 1);
  }

  return { retried };
}
