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

/** Webhooks have no authenticated company context, so accept a valid configured company key. */
export async function getSquareWebhookKeys(): Promise<string[]> {
  const rows = await db.select({ squareWebhookSignatureKeyEncrypted: companies.squareWebhookSignatureKeyEncrypted }).from(companies);
  return [...new Set([...rows.map((row) => decryptSettingSecret(row.squareWebhookSignatureKeyEncrypted)).filter((key): key is string => Boolean(key)), ...(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ? [process.env.SQUARE_WEBHOOK_SIGNATURE_KEY] : [])])];
}
