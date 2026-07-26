import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, companies } from "@/db/schema";

export async function GET() {
  const admin = await requireAdmin();
  const [company] = await db.select().from(companies).where(eq(companies.id, admin.companyId)).limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json({
    company,
    apiConfig: {
      ghl: {
        apiKeyConfigured: Boolean(process.env.GHL_API_KEY),
        locationConfigured: Boolean(process.env.GHL_LOCATION_ID),
        webhookSecretConfigured: Boolean(process.env.GHL_WEBHOOK_SECRET),
      },
      square: {
        configured: Boolean(process.env.SQUARE_ACCESS_TOKEN),
        webhookConfigured: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
      },
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
  beforePhotoUrl: z.string().trim().max(50000).nullable().optional(),
  afterPhotoUrl: z.string().trim().max(50000).nullable().optional(),
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
      logoUrl: z.string().trim().max(50000).nullable().optional(),
      reviewUrl: z.string().trim().max(50000).nullable().optional(),
      beforePhotoUrl: z.string().trim().max(50000).nullable().optional(),
      afterPhotoUrl: z.string().trim().max(50000).nullable().optional(),
      photoSets: z.array(quotePhotoSetSchema).max(3).optional(),
      insuranceUrl: z.string().trim().max(50000).nullable().optional(),
      w9Url: z.string().trim().max(50000).nullable().optional(),
      preferredDatePrompt: z.string().max(500).optional(),
      contactPhone: z.string().trim().max(50).nullable().optional(),
    })
    .optional(),
  ghlTagMap: ghlTagMapSchema.optional(),
  ghlWorkflowMap: ghlWorkflowMapSchema.optional(),
  mileageRateCents: z.number().int().nonnegative().max(500).optional(),
  revenueTargetCents: z.number().int().nonnegative().nullable().optional(),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).optional(),
  payTierBrackets: z.array(payTierBracketSchema).min(1).max(12).optional(),
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
      brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
      website: z.string().trim().max(500).nullable().optional(),
      reviewUrl: z.string().trim().max(50000).nullable().optional(),
    })
    .optional(),
});

/** PATCH /api/settings — partial update. Only the keys present in the body are
 * changed; `name`/`timezone` update the row directly, everything else
 * (quoteTemplate, ghlTagMap) merges into the `settings` jsonb blob so
 * different Settings sub-pages can save independently of each other. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [company] = await db
    .select({ name: companies.name, timezone: companies.timezone, settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, admin.companyId))
    .limit(1);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const existingSettings = (company.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = {
    ...existingSettings,
    ...(parsed.data.quoteTemplate ? { quoteTemplate: parsed.data.quoteTemplate } : {}),
    ...(parsed.data.ghlTagMap ? { ghlTagMap: parsed.data.ghlTagMap } : {}),
    ...(parsed.data.ghlWorkflowMap ? { ghlWorkflowMap: parsed.data.ghlWorkflowMap } : {}),
    ...(parsed.data.mileageRateCents !== undefined ? { mileageRateCents: parsed.data.mileageRateCents } : {}),
    ...(parsed.data.revenueTargetCents !== undefined ? { revenueTargetCents: parsed.data.revenueTargetCents } : {}),
    ...(parsed.data.holidays !== undefined ? { holidays: parsed.data.holidays } : {}),
    ...(parsed.data.payTierBrackets ? { payTierBrackets: parsed.data.payTierBrackets } : {}),
    ...(parsed.data.inventory ? { inventory: parsed.data.inventory } : {}),
    ...(parsed.data.branding ? { branding: parsed.data.branding } : {}),
  };

  const changedFields: Record<string, unknown> = {};
  if (parsed.data.name !== undefined && parsed.data.name !== company.name) changedFields.name = parsed.data.name;
  if (parsed.data.timezone !== undefined && parsed.data.timezone !== company.timezone) changedFields.timezone = parsed.data.timezone;
  if (Object.keys(nextSettings).length !== Object.keys(existingSettings).length || JSON.stringify(nextSettings) !== JSON.stringify(existingSettings)) {
    changedFields.settings = nextSettings;
  }

  const [updated] = await db
    .update(companies)
    .set({
      name: parsed.data.name ?? company.name,
      timezone: parsed.data.timezone ?? company.timezone,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, admin.companyId))
    .returning();

  if (Object.keys(changedFields).length > 0) {
    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      action: "settings.updated",
      entityType: "company",
      entityId: admin.companyId,
      before: { name: company.name, timezone: company.timezone, settings: existingSettings },
      after: { name: updated.name, timezone: updated.timezone, settings: updated.settings },
    });
  }

  return NextResponse.json({ company: updated });
}
