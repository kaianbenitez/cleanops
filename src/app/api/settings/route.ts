import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { validatePayTierBrackets } from "@/lib/payroll/brackets";
import { encryptSettingSecret } from "@/lib/settings/encryption";
import { getCompanyIntegrationStatus } from "@/lib/settings/integrations";

export async function GET() {
  const admin = await requireAdmin();
  const [company] = await db
    .select({ id: companies.id, name: companies.name, timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company)
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const integrationStatus = await getCompanyIntegrationStatus(admin.companyId);
  return NextResponse.json({
    company,
    apiConfig: {
      ghl: {
        apiKeyConfigured: Boolean(process.env.GHL_API_KEY),
        locationConfigured: Boolean(process.env.GHL_LOCATION_ID),
        webhookSecretConfigured: Boolean(process.env.GHL_WEBHOOK_SECRET),
      },
      square: {
        configured: integrationStatus.squareConfigured,
        webhookConfigured: integrationStatus.squareWebhookConfigured,
      },
      googleMaps: { configured: integrationStatus.googleMapsConfigured },
    },
  });
}

const ghlTagMapSchema = z.object({
  quoteGiven: z.string().trim().min(1).max(100),
  quoteAccepted: z.string().trim().min(1).max(100),
  firstCleanBooked: z.string().trim().min(1).max(100),
  firstCleanDone: z.string().trim().min(1).max(100),
  client: z.string().trim().min(1).max(100),
  lost: z.string().trim().min(1).max(100),
  moved: z.string().trim().min(1).max(100),
  invoiceSent: z.string().trim().min(1).max(100),
});

const ghlWorkflowMapSchema = z.object({
  newLead: z.string().trim().max(200).optional().or(z.literal("")),
  quoteSent: z.string().trim().max(200).optional().or(z.literal("")),
  quoteAccepted: z.string().trim().max(200).optional().or(z.literal("")),
  firstCleanBooked: z.string().trim().max(200).optional().or(z.literal("")),
  firstCleanCompleted: z.string().trim().max(200).optional().or(z.literal("")),
  client: z.string().trim().max(200).optional().or(z.literal("")),
  lost: z.string().trim().max(200).optional().or(z.literal("")),
  moved: z.string().trim().max(200).optional().or(z.literal("")),
  invoiceSent: z.string().trim().max(200).optional().or(z.literal("")),
  postServiceFeedback: z.string().trim().max(200).optional().or(z.literal("")),
});

const payTierBracketSchema = z.object({
  minHours: z.number().nonnegative(),
  maxHours: z.number().nonnegative().nullable(),
  label: z.string().trim().min(1).max(60),
});

const inventoryItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  onHand: z.number().int().nonnegative().max(100000),
  reorderAt: z.number().int().nonnegative().max(100000),
  unitCostCents: z.number().int().nonnegative().max(100000000),
  supplier: z.string().trim().max(120).optional().default(""),
});

const quotePhotoSetSchema = z.object({
  label: z.string().trim().max(100).optional().or(z.literal("")),
  beforePhotoUrl: z.string().trim().max(2000).nullable().optional(),
  afterPhotoUrl: z.string().trim().max(2000).nullable().optional(),
});

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  quoteTemplate: z
    .object({
      introLetter: z.string().max(10000).optional(),
      terms: z.string().max(10000).optional(),
      ownerName: z.string().max(200).optional(),
      ownerTitle: z.string().max(200).optional(),
      logoUrl: z.string().trim().max(2000).nullable().optional(),
      reviewUrl: z.string().trim().max(2000).nullable().optional(),
      beforePhotoUrl: z.string().trim().max(2000).nullable().optional(),
      afterPhotoUrl: z.string().trim().max(2000).nullable().optional(),
      photoSets: z.array(quotePhotoSetSchema).max(3).optional(),
      insuranceUrl: z.string().trim().max(2000).nullable().optional(),
      w9Url: z.string().trim().max(2000).nullable().optional(),
      preferredDatePrompt: z.string().max(500).optional(),
      contactPhone: z.string().trim().max(50).nullable().optional(),
    })
    .optional(),
  ghlTagMap: ghlTagMapSchema.optional(),
  ghlWorkflowMap: ghlWorkflowMapSchema.optional(),
  mileageRateCents: z.number().int().nonnegative().max(500).optional(),
  revenueTargetCents: z.number().int().nonnegative().nullable().optional(),
  holidays: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(366)
    .optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  // Staff-board column order. Employee ids are validated again against the
  // company roster by the calendar UI, so stale ids from archived staff are
  // harmless and simply ignored when the board renders.
  staffColumnOrder: z.array(z.string().uuid()).max(500).optional(),
  // Bracket ladders that overlap, run backwards, or have no open-ended top
  // don't fail at payroll time — resolveTierRateCents() just returns the wrong
  // rate. Reject them here so the API is the authority, not just the UI form.
  payTierBrackets: z
    .array(payTierBracketSchema)
    .min(1)
    .max(12)
    .superRefine((brackets, ctx) => {
      for (const message of validatePayTierBrackets(brackets).errors) {
        ctx.addIssue({ code: "custom", message });
      }
    })
    .optional(),
  inventory: z.array(inventoryItemSchema).max(500).optional(),
  branding: z
    .object({
      logoUrl: z.string().trim().max(1000).nullable().optional(),
      phone: z.string().trim().max(50).nullable().optional(),
      email: z.string().trim().max(200).nullable().optional(),
      addressLine1: z.string().trim().max(200).nullable().optional(),
      addressLine2: z.string().trim().max(200).nullable().optional(),
      city: z.string().trim().max(100).nullable().optional(),
      state: z.string().trim().max(50).nullable().optional(),
      zip: z.string().trim().max(20).nullable().optional(),
      brandColor: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional()
        .or(z.literal("")),
      website: z.string().trim().max(500).nullable().optional(),
      reviewUrl: z.string().trim().max(50000).nullable().optional(),
    })
    .optional(),
  squareAccessToken: z.string().trim().min(1).max(1000).optional(),
  squareEnvironment: z.enum(["sandbox", "production"]).optional(),
  squareWebhookSignatureKey: z.string().trim().min(1).max(1000).optional(),
  googleMapsApiKey: z.string().trim().min(1).max(1000).optional(),
});

/** PATCH /api/settings — partial update. Only the keys present in the body are
 * changed; `name`/`timezone` update the row directly, everything else
 * (quoteTemplate, ghlTagMap) merges into the `settings` jsonb blob so
 * different Settings sub-pages can save independently of each other. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      timezone: companies.timezone,
      settings: companies.settings,
    })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company)
    return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const existingSettings =
    (company.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = {
    ...existingSettings,
    ...(parsed.data.quoteTemplate
      ? { quoteTemplate: parsed.data.quoteTemplate }
      : {}),
    ...(parsed.data.ghlTagMap ? { ghlTagMap: parsed.data.ghlTagMap } : {}),
    ...(parsed.data.ghlWorkflowMap
      ? { ghlWorkflowMap: parsed.data.ghlWorkflowMap }
      : {}),
    ...(parsed.data.mileageRateCents !== undefined
      ? { mileageRateCents: parsed.data.mileageRateCents }
      : {}),
    ...(parsed.data.revenueTargetCents !== undefined
      ? { revenueTargetCents: parsed.data.revenueTargetCents }
      : {}),
    ...(parsed.data.holidays !== undefined
      ? { holidays: parsed.data.holidays }
      : {}),
    ...(parsed.data.workingDays !== undefined
      ? { workingDays: parsed.data.workingDays }
      : {}),
    ...(parsed.data.staffColumnOrder !== undefined
      ? { staffColumnOrder: parsed.data.staffColumnOrder }
      : {}),
    ...(parsed.data.payTierBrackets
      ? { payTierBrackets: parsed.data.payTierBrackets }
      : {}),
    ...(parsed.data.inventory ? { inventory: parsed.data.inventory } : {}),
    ...(parsed.data.branding ? { branding: parsed.data.branding } : {}),
  };

  const changedFields: Record<string, unknown> = {};
  if (parsed.data.name !== undefined && parsed.data.name !== company.name)
    changedFields.name = parsed.data.name;
  if (
    parsed.data.timezone !== undefined &&
    parsed.data.timezone !== company.timezone
  )
    changedFields.timezone = parsed.data.timezone;
  if (
    Object.keys(nextSettings).length !== Object.keys(existingSettings).length ||
    JSON.stringify(nextSettings) !== JSON.stringify(existingSettings)
  ) {
    changedFields.settings = nextSettings;
  }

  // Blank fields are intentionally omitted by the schema/UI and therefore
  // leave any existing encrypted secret untouched.
  const encryptedSecrets: Partial<typeof companies.$inferInsert> = {};
  try {
    if (parsed.data.squareAccessToken !== undefined) {
      encryptedSecrets.squareAccessTokenEncrypted = encryptSettingSecret(parsed.data.squareAccessToken);
      changedFields.squareAccessTokenConfigured = true;
    }
    if (parsed.data.squareWebhookSignatureKey !== undefined) {
      encryptedSecrets.squareWebhookSignatureKeyEncrypted = encryptSettingSecret(parsed.data.squareWebhookSignatureKey);
      changedFields.squareWebhookSignatureKeyConfigured = true;
    }
    if (parsed.data.googleMapsApiKey !== undefined) {
      encryptedSecrets.googleMapsApiKeyEncrypted = encryptSettingSecret(parsed.data.googleMapsApiKey);
      changedFields.googleMapsApiKeyConfigured = true;
    }
  } catch {
    return NextResponse.json({ error: "Settings encryption is not configured. Add SETTINGS_ENCRYPTION_KEY before saving integration keys." }, { status: 503 });
  }
  if (parsed.data.squareEnvironment !== undefined) changedFields.squareEnvironment = parsed.data.squareEnvironment;

  const [updated] = await db
    .update(companies)
    .set({
      name: parsed.data.name ?? company.name,
      timezone: parsed.data.timezone ?? company.timezone,
      settings: nextSettings,
      updatedAt: new Date(),
      ...encryptedSecrets,
      ...(parsed.data.squareEnvironment !== undefined ? { squareEnvironment: parsed.data.squareEnvironment } : {}),
    })
    .where(eq(companies.id, admin.companyId))
    .returning({ id: companies.id, name: companies.name, timezone: companies.timezone, settings: companies.settings });

  if (Object.keys(changedFields).length > 0) {
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "settings.updated",
      entityType: "company",
      entityId: admin.companyId,
      before: { name: company.name, timezone: company.timezone, settings: existingSettings },
      after: { name: updated.name, timezone: updated.timezone, settings: updated.settings, ...Object.fromEntries(Object.keys(encryptedSecrets).map((field) => [field.replace("Encrypted", "Configured"), true])), ...(parsed.data.squareEnvironment !== undefined ? { squareEnvironment: parsed.data.squareEnvironment } : {}) },
    });
  }

  return NextResponse.json({ company: updated });
}
