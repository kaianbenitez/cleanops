import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { webhookEvents, customers, companies, customerLocations } from "@/db/schema";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";

/**
 * Inbound GHL webhook — replaces the Zapier -> TCF zap (PLAN.md §6). A GHL
 * "New Lead" workflow posts contact data here on form submit or inbound SMS;
 * we upsert a `customers` row (matched by ghl_contact_id, then phone, then
 * email — in that priority order) with status 'lead'.
 *
 * Every request is stored raw in webhook_events BEFORE processing, per
 * PLAN.md §8 rule 7, so a bad payload or a bug in the handler below never
 * loses the underlying event — it's still on disk to replay/debug.
 */
const expectedSecretPayload = () => process.env.GHL_WEBHOOK_SECRET ?? "";

function verifySignature(req: NextRequest): boolean {
  const provided = req.headers.get("x-webhook-secret") ?? "";
  const expected = expectedSecretPayload();
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = { raw: rawBody };
  }

  const signatureValid = verifySignature(req);

  const [event] = await db
    .insert(webhookEvents)
    .values({ source: "ghl", payload: payload as object, signatureValid })
    .returning();

  if (!signatureValid) {
    await db
      .update(webhookEvents)
      .set({ error: "Invalid or missing x-webhook-secret header" })
      .where(eq(webhookEvents.id, event.id));
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = getEventId(payload);
  if (eventId) {
    const [duplicate] = await db
      .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.source, "ghl"), ne(webhookEvents.id, event.id), sql`${webhookEvents.payload}->>'event_id' = ${eventId}`))
      .limit(1);
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true, processedAt: duplicate.processedAt });
  }

  try {
    await processLead(payload);
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, event.id));
    // Still 200 — GHL doesn't need to retry, the event is safely stored for
    // manual review; a processing bug shouldn't cause GHL to hammer retries.
  }

  return NextResponse.json({ ok: true });
}

type GhlLeadPayload = {
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  source?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  notes?: string;
  tags?: string[];
  customFields?: Array<{ id?: string; key?: string; value?: unknown }>;
  contact?: Record<string, unknown>;
  form?: Record<string, unknown>;
  fields?: Array<{ name?: string; key?: string; value?: unknown }>;
};

function getEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  for (const key of ["event_id", "eventId", "webhook_id", "webhookId", "id"]) {
    if (typeof data[key] === "string" && data[key]) return data[key];
  }
  return "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFieldValue(fields: Array<{ id?: string; key?: string; name?: string; value?: unknown }> | undefined, ...keys: string[]): string {
  if (!fields) return "";
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const field of fields) {
    const candidates = [field.id, field.key, field.name].filter((value): value is string => typeof value === "string");
    if (candidates.some((candidate) => wanted.has(candidate.toLowerCase()))) {
      const value = field.value;
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      if (value && typeof value === "object") return JSON.stringify(value);
    }
  }
  return "";
}

function normalizeLead(payload: unknown): GhlLeadPayload {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const contact = (data.contact && typeof data.contact === "object" ? data.contact : {}) as Record<string, unknown>;
  const form = (data.form && typeof data.form === "object" ? data.form : {}) as Record<string, unknown>;
  const fields = Array.isArray(data.fields) ? (data.fields as Array<{ name?: string; key?: string; value?: unknown }>) : undefined;
  const customFields = Array.isArray(data.customFields) ? (data.customFields as Array<{ id?: string; key?: string; value?: unknown }>) : undefined;

  const firstName = asString(data.first_name ?? data.firstName ?? contact.first_name ?? contact.firstName ?? form.first_name ?? form.firstName);
  const lastName = asString(data.last_name ?? data.lastName ?? contact.last_name ?? contact.lastName ?? form.last_name ?? form.lastName);
  const email = asString(data.email ?? contact.email ?? form.email);
  const phone = asString(data.phone ?? contact.phone ?? form.phone);
  const source = asString(data.source ?? form.source ?? contact.source);

  const address1 = asString(
    data.address1 ??
      data.addressLine1 ??
      contact.address1 ??
      contact.addressLine1 ??
      form.address1 ??
      getFieldValue(fields, "address1", "address_line1", "street", "street_address", "address")
  );
  const address2 = asString(data.address2 ?? data.addressLine2 ?? contact.address2 ?? contact.addressLine2 ?? form.address2 ?? getFieldValue(fields, "address2", "address_line2", "suite", "unit"));
  const city = asString(data.city ?? contact.city ?? form.city ?? getFieldValue(fields, "city"));
  const state = asString(data.state ?? contact.state ?? form.state ?? getFieldValue(fields, "state"));
  const postalCode = asString(data.postal_code ?? data.postalCode ?? contact.postal_code ?? contact.postalCode ?? form.postal_code ?? form.postalCode ?? getFieldValue(fields, "postal_code", "postalCode", "zip", "zip_code"));
  const notes = asString(data.notes ?? contact.notes ?? form.notes ?? getFieldValue(fields, "notes", "note", "comments", "comment"));

  return {
    contact_id: asString(data.contact_id ?? data.contactId ?? contact.id ?? form.contact_id ?? form.contactId),
    first_name: firstName,
    last_name: lastName,
    email: email || undefined,
    phone: phone || undefined,
    source: source || undefined,
    address1: address1 || undefined,
    address2: address2 || undefined,
    city: city || undefined,
    state: state || undefined,
    postal_code: postalCode || undefined,
    notes: notes || undefined,
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
    customFields,
    contact,
    form,
    fields,
  };
}

async function processLead(payload: unknown): Promise<void> {
  const p = normalizeLead(payload);
  if (!p.first_name && !p.last_name && !p.phone && !p.email) {
    throw new Error("Payload has no usable contact fields");
  }

  const [company] = await db.select().from(companies).limit(1);
  if (!company) throw new Error("No company configured");

  const matchConditions = [];
  if (p.contact_id) matchConditions.push(eq(customers.ghlContactId, p.contact_id));
  if (p.phone) matchConditions.push(eq(customers.phone, p.phone));
  if (p.email) matchConditions.push(eq(customers.email, p.email));

  const [existing] = matchConditions.length
    ? await db
        .select()
        .from(customers)
        .where(and(eq(customers.companyId, company.id), or(...matchConditions)))
        .limit(1)
    : [];

  if (existing) {
    await db
      .update(customers)
      .set({
        ghlContactId: p.contact_id ?? existing.ghlContactId,
        firstName: p.first_name ?? existing.firstName,
        lastName: p.last_name ?? existing.lastName,
        email: p.email ?? existing.email,
        phone: p.phone ?? existing.phone,
        addressLine1: p.address1 ?? existing.addressLine1,
        addressLine2: p.address2 ?? existing.addressLine2,
        city: p.city ?? existing.city,
        state: p.state ?? existing.state,
        zip: p.postal_code ?? existing.zip,
        notes: p.notes ?? existing.notes,
        source: p.source ?? existing.source,
      })
      .where(eq(customers.id, existing.id));
    if (p.address1) {
      await upsertPrimaryLocation(existing.id, company.id, p);
    }
    return;
  }

  const [inserted] = await db.insert(customers).values({
    companyId: company.id,
    ghlContactId: p.contact_id,
    firstName: p.first_name ?? "Unknown",
    lastName: p.last_name ?? "",
    email: p.email,
    phone: p.phone,
    status: "lead",
    source: p.source ?? "ghl",
    addressLine1: p.address1,
    addressLine2: p.address2,
    city: p.city,
    state: p.state,
    zip: p.postal_code,
    notes: p.notes,
    tags: p.tags ?? [],
    homeDetails: buildHomeDetails(p),
  }).returning();

  if (p.address1) {
    await db.insert(customerLocations).values({
      companyId: company.id,
      customerId: inserted.id,
      label: "Primary home",
      addressLine1: p.address1,
      addressLine2: p.address2 || null,
      city: p.city || null,
      state: p.state || null,
      zip: p.postal_code || null,
      isPrimary: true,
      isActive: true,
      accessInstructions: p.notes || null,
    });
  }
}

async function upsertPrimaryLocation(customerId: string, companyId: string, payload: GhlLeadPayload): Promise<void> {
  const [existingLocation] = await db
    .select()
    .from(customerLocations)
    .where(and(eq(customerLocations.companyId, companyId), eq(customerLocations.customerId, customerId), eq(customerLocations.isPrimary, true)))
    .limit(1);

  const locationFields = {
    label: "Primary home",
    addressLine1: payload.address1 ?? existingLocation?.addressLine1 ?? "",
    addressLine2: payload.address2 ?? existingLocation?.addressLine2 ?? null,
    city: payload.city ?? existingLocation?.city ?? null,
    state: payload.state ?? existingLocation?.state ?? null,
    zip: payload.postal_code ?? existingLocation?.zip ?? null,
    accessInstructions: payload.notes ?? existingLocation?.accessInstructions ?? null,
    isPrimary: true,
    isActive: true,
  };

  if (existingLocation) {
    await db
      .update(customerLocations)
      .set({ ...locationFields, updatedAt: new Date() })
      .where(eq(customerLocations.id, existingLocation.id));
  } else if (locationFields.addressLine1) {
    await db.insert(customerLocations).values({
      companyId,
      customerId,
      ...locationFields,
    });
  }
}

function buildHomeDetails(payload: GhlLeadPayload): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  for (const field of payload.customFields ?? []) {
    const key = field.key || field.id;
    if (!key) continue;
    details[key] = field.value ?? null;
  }
  if (payload.fields) {
    for (const field of payload.fields) {
      const key = field.key || field.name;
      if (!key) continue;
      details[key] = field.value ?? null;
    }
  }
  if (payload.notes) details.notes = payload.notes;
  if (payload.source) details.source = payload.source;
  return details;
}
