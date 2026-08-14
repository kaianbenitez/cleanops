/**
 * Thin wrapper around the GoHighLevel API v2 (contacts endpoints). Every
 * outbound call goes through here so it's mockable and centrally logged —
 * per PLAN.md §8 rule 6, never call GHL ad hoc from route/UI code.
 *
 * Mock mode: when GHL_API_KEY is unset (local dev, no real GHL account
 * wired up yet), calls succeed immediately with a synthetic response
 * instead of hitting the network. This lets the whole sync pipeline
 * (event -> lib/ghl/sync.ts -> ghl_sync_log) be built and verified before
 * real GHL credentials exist.
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

function isMockMode(): boolean {
  return !process.env.GHL_API_KEY;
}

type GhlResponse = { ok: boolean; status: number; body: unknown; mocked?: boolean };

async function ghlFetch(path: string, init: RequestInit): Promise<GhlResponse> {
  if (isMockMode()) {
    return { ok: true, status: 200, body: { mock: true, path, method: init.method }, mocked: true };
  }

  const res = await fetch(`${GHL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(8000),
  });

  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/** Creates or updates a GHL contact, matching by our stored ghlContactId if present. */
export async function upsertContact(params: {
  ghlContactId?: string | null;
  locationId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): Promise<GhlResponse> {
  const payload = {
    firstName: params.firstName,
    lastName: params.lastName,
    email: params.email ?? undefined,
    phone: params.phone ?? undefined,
    address1: params.address1 ?? undefined,
    city: params.city ?? undefined,
    state: params.state ?? undefined,
    postalCode: params.postalCode ?? undefined,
  };
  if (params.ghlContactId) {
    return ghlFetch(`/contacts/${params.ghlContactId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  return ghlFetch(`/contacts/`, {
    method: "POST",
    body: JSON.stringify({ locationId: params.locationId, ...payload }),
  });
}

export async function addTags(ghlContactId: string, tags: string[]): Promise<GhlResponse> {
  return ghlFetch(`/contacts/${ghlContactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

export async function removeTags(ghlContactId: string, tags: string[]): Promise<GhlResponse> {
  return ghlFetch(`/contacts/${ghlContactId}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags }),
  });
}

/** Sets custom field values on a contact. `fields` keys are GHL custom field IDs/keys. */
export async function setCustomFields(
  ghlContactId: string,
  fields: Record<string, string>
): Promise<GhlResponse> {
  return ghlFetch(`/contacts/${ghlContactId}`, {
    method: "PUT",
    body: JSON.stringify({
      customFields: Object.entries(fields).map(([key, field_value]) => ({ key, field_value })),
    }),
  });
}

/** Adds a contact to a workflow so GHL can continue the right automation. */
export async function addContactToWorkflow(ghlContactId: string, workflowId: string): Promise<GhlResponse> {
  return ghlFetch(`/contacts/${ghlContactId}/workflow/${workflowId}`, {
    method: "POST",
  });
}

export type GhlContactSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  tags: string[];
  customFields: Array<{ id: string; key?: string; value: string }>;
};

// Small deterministic mock directory so the search/pull-into-CleanOps flow
// is fully clickable and demoable before real GHL credentials exist — same
// reasoning as the rest of this file's mock mode.
const MOCK_CONTACTS: GhlContactSummary[] = [
  {
    id: "mock-ghl-contact-1",
    firstName: "Taylor",
    lastName: "Reyes",
    email: "taylor.reyes@example.com",
    phone: "555-201-3344",
    address1: "418 Elm St",
    city: "Bartlesville",
    state: "OK",
    postalCode: "74003",
    tags: ["new-lead", "google-ads"],
    customFields: [{ id: "mock-cf-1", key: "referral_source", value: "Google Search" }],
  },
  {
    id: "mock-ghl-contact-2",
    firstName: "Morgan",
    lastName: "Lawrence",
    email: "morgan.lawrence@example.com",
    phone: "555-201-9981",
    address1: "27 Choctaw Ave",
    city: "Bartlesville",
    state: "OK",
    postalCode: "74003",
    tags: ["quote-given"],
    customFields: [{ id: "mock-cf-2", key: "preferred_day", value: "Tuesday" }],
  },
];

function contactFromApiShape(raw: Record<string, unknown>): GhlContactSummary {
  return {
    id: String(raw.id ?? ""),
    firstName: String(raw.firstName ?? raw.first_name ?? ""),
    lastName: String(raw.lastName ?? raw.last_name ?? ""),
    email: (raw.email as string) ?? null,
    phone: (raw.phone as string) ?? null,
    address1: (raw.address1 as string) ?? null,
    city: (raw.city as string) ?? null,
    state: (raw.state as string) ?? null,
    postalCode: (raw.postalCode as string) ?? null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    customFields: Array.isArray(raw.customFields) ? (raw.customFields as GhlContactSummary["customFields"]) : [],
  };
}

/** Searches GHL contacts by name/email/phone. Used to pull an existing GHL
 * contact/prospect into CleanOps (customer creation, quote builder) instead
 * of retyping their info. */
export async function searchGhlContacts(query: string, locationId: string): Promise<GhlContactSummary[]> {
  if (isMockMode()) {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_CONTACTS;
    return MOCK_CONTACTS.filter((c) =>
      `${c.firstName} ${c.lastName} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q)
    );
  }

  const res = await ghlFetch(
    `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(query)}&limit=20`,
    { method: "GET" }
  );
  if (!res.ok) return [];
  const body = res.body as { contacts?: Record<string, unknown>[] };
  return (body.contacts ?? []).map(contactFromApiShape);
}

/** Fetches one GHL contact by id, including custom fields — used once the
 * admin picks a specific search result to see/apply full detail. */
export async function getGhlContact(contactId: string): Promise<GhlContactSummary | null> {
  if (isMockMode()) {
    return MOCK_CONTACTS.find((c) => c.id === contactId) ?? null;
  }

  const res = await ghlFetch(`/contacts/${contactId}`, { method: "GET" });
  if (!res.ok) return null;
  const body = res.body as { contact?: Record<string, unknown> };
  return body.contact ? contactFromApiShape(body.contact) : null;
}

/** Minimal health check for the connected GHL API key + location ID. */
export async function getGhlLocation(locationId: string): Promise<GhlResponse> {
  return ghlFetch(`/locations/${encodeURIComponent(locationId)}`, { method: "GET" });
}
