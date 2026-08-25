import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { decryptSettingSecret } from "./encryption";

export type SquareConfig = {
  accessToken: string | null;
  environment: "sandbox" | "production";
  webhookSignatureKey: string | null;
  locationId: string;
};

export async function getCompanyIntegrationStatus(companyId: string) {
  const [company] = await db.select({
    squareAccessTokenEncrypted: companies.squareAccessTokenEncrypted,
    squareWebhookSignatureKeyEncrypted: companies.squareWebhookSignatureKeyEncrypted,
    googleMapsApiKeyEncrypted: companies.googleMapsApiKeyEncrypted,
  }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return {
    squareConfigured: Boolean(company?.squareAccessTokenEncrypted || process.env.SQUARE_ACCESS_TOKEN),
    squareWebhookConfigured: Boolean(company?.squareWebhookSignatureKeyEncrypted || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
    googleMapsConfigured: Boolean(company?.googleMapsApiKeyEncrypted || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  };
}

export async function getCompanySquareConfig(companyId: string): Promise<SquareConfig> {
  const [company] = await db.select({
    squareAccessTokenEncrypted: companies.squareAccessTokenEncrypted,
    squareEnvironment: companies.squareEnvironment,
    squareWebhookSignatureKeyEncrypted: companies.squareWebhookSignatureKeyEncrypted,
  }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return {
    accessToken: decryptSettingSecret(company?.squareAccessTokenEncrypted) ?? process.env.SQUARE_ACCESS_TOKEN ?? null,
    environment: company?.squareEnvironment ?? (process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox"),
    webhookSignatureKey: decryptSettingSecret(company?.squareWebhookSignatureKeyEncrypted) ?? process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? null,
    locationId: process.env.SQUARE_LOCATION_ID ?? "mock-location",
  };
}

export async function getCompanyGoogleMapsApiKey(companyId: string): Promise<string | null> {
  const [company] = await db.select({ googleMapsApiKeyEncrypted: companies.googleMapsApiKeyEncrypted }).from(companies).where(eq(companies.id, companyId)).limit(1);
  return decryptSettingSecret(company?.googleMapsApiKeyEncrypted) ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
}

export type SquareWebhookKey = { companyId: string | null; key: string };

/** Webhooks have no authenticated company context, so every configured key is a
 * candidate. Each key keeps its owning `companyId` so the caller can scope the
 * invoice lookup to that company once a key matches — a signature valid for one
 * company must never authenticate a payment event for a different company's
 * invoice. The env-var key has no single owning company (`companyId: null`);
 * a match against it stays unscoped, same as before. */
export async function getSquareWebhookKeys(): Promise<SquareWebhookKey[]> {
  const rows = await db.select({ id: companies.id, squareWebhookSignatureKeyEncrypted: companies.squareWebhookSignatureKeyEncrypted }).from(companies);
  const perCompany: SquareWebhookKey[] = [];
  for (const row of rows) {
    const key = decryptSettingSecret(row.squareWebhookSignatureKeyEncrypted);
    if (key) perCompany.push({ companyId: row.id, key });
  }
  return process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    ? [...perCompany, { companyId: null, key: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY }]
    : perCompany;
}
