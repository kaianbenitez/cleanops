import { createHmac } from "crypto";
import type { SquareConfig } from "@/lib/settings/integrations";

/**
 * Thin wrapper around the Square API (Customers + Invoices). Same mock-mode
 * pattern as lib/ghl/client.ts: when SQUARE_ACCESS_TOKEN is unset, calls
 * succeed immediately with a synthetic response instead of hitting the
 * network, so the whole invoicing flow is buildable/testable before real
 * Square sandbox credentials exist. Per PLAN.md §6, sandbox is the default
 * environment — SQUARE_ENVIRONMENT controls the base URL once a real token
 * is configured.
 */

function baseUrl(config: SquareConfig): string {
  return config.environment === "production"
    ? "https://connect.squareup.com/v2"
    : "https://connect.squareupsandbox.com/v2";
}

function isMockMode(config: SquareConfig): boolean {
  return !config.accessToken;
}

type SquareResponse = { ok: boolean; status: number; body: unknown; mocked?: boolean };

async function squareFetch(config: SquareConfig, path: string, init: RequestInit): Promise<SquareResponse> {
  if (isMockMode(config)) {
    return { ok: true, status: 200, body: { mock: true, path, method: init.method }, mocked: true };
  }

  const res = await fetch(`${baseUrl(config)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-01-18",
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/** Upserts a Square customer, matching by our stored squareCustomerId if present. */
export async function upsertSquareCustomer(config: SquareConfig, params: {
  squareCustomerId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}): Promise<SquareResponse> {
  if (params.squareCustomerId) {
    return squareFetch(config, `/customers/${params.squareCustomerId}`, {
      method: "PUT",
      body: JSON.stringify({
        given_name: params.firstName,
        family_name: params.lastName,
        email_address: params.email ?? undefined,
        phone_number: params.phone ?? undefined,
      }),
    });
  }

  return squareFetch(config, `/customers`, {
    method: "POST",
    body: JSON.stringify({
      given_name: params.firstName,
      family_name: params.lastName,
      email_address: params.email ?? undefined,
      phone_number: params.phone ?? undefined,
    }),
  });
}

/** Creates and publishes a Square invoice in one step (draft-then-publish under the hood
 * in mock mode; real Square requires two calls, handled inside this function). */
export async function createAndPublishInvoice(config: SquareConfig, params: {
  squareCustomerId: string;
  locationId: string;
  title: string;
  totalCents: number;
  idempotencyKey: string;
}): Promise<SquareResponse & { invoiceId?: string; publicUrl?: string }> {
  if (isMockMode(config)) {
    const mockId = `mock-inv-${params.idempotencyKey.slice(0, 8)}`;
    return {
      ok: true,
      status: 200,
      mocked: true,
      body: { mock: true },
      invoiceId: mockId,
      publicUrl: `https://squareup.com/mock-invoice/${mockId}`,
    };
  }

  const createRes = await squareFetch(config, `/invoices`, {
    method: "POST",
    body: JSON.stringify({
      invoice: {
        location_id: params.locationId,
        primary_recipient: { customer_id: params.squareCustomerId },
        title: params.title,
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: new Date().toISOString().slice(0, 10),
          },
        ],
      },
      idempotency_key: params.idempotencyKey,
    }),
  });

  if (!createRes.ok) return createRes;

  const created = createRes.body as { invoice?: { id?: string; version?: number } };
  const invoiceId = created.invoice?.id;
  if (!invoiceId) return { ...createRes, ok: false };

  const publishRes = await squareFetch(config, `/invoices/${invoiceId}/publish`, {
    method: "POST",
    body: JSON.stringify({ version: created.invoice?.version ?? 0, idempotency_key: `${params.idempotencyKey}-pub` }),
  });

  const published = publishRes.body as { invoice?: { public_url?: string } };
  return { ...publishRes, invoiceId, publicUrl: published.invoice?.public_url };
}

/** Verifies a Square webhook signature (SHA-256 HMAC of notification URL + body). */
export function verifySquareSignature(rawBody: string, signature: string, notificationUrl: string, key: string | null): boolean {
  if (!key) return false;
  const hmac = createHmac("sha256", key).update(notificationUrl + rawBody).digest("base64");
  return hmac === signature;
}
