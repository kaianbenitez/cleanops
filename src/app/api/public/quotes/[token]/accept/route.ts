import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appNotifications, auditLog, quotes } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { ADD_ONS, MAX_ADD_ON_QTY, addOnLineTotalCents } from "@/lib/pricing/add-ons";

const RECURRING_SERVICE_TYPES = ["weekly", "biweekly", "four_weeks"] as const;

const desiredDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid desired date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10);
  }, "Choose today or a future date");

const acceptSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  signatureName: z.string().trim().min(1, "Signature name is required"),
  addOns: z
    .array(z.object({ key: z.string().trim().min(1), qty: z.number().int().min(1).max(MAX_ADD_ON_QTY) }))
    .default([]),
  recurringServiceType: z.enum(RECURRING_SERVICE_TYPES).nullable().optional(),
  desiredCleaningDate: desiredDateSchema.nullable().optional(),
});

/** POST /api/public/quotes/[token]/accept — unauthenticated customer-facing accept action.
 * The customer picks which of the quote's priced tiers they want, and types their name as
 * a lightweight e-signature. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const parsed = acceptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [quote] = await db.select().from(quotes).where(eq(quotes.publicToken, token)).limit(1);

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.status === "accepted") {
    return NextResponse.json({ ok: true, desiredCleaningDate: quote.desiredCleaningDate });
  }
  if (quote.status === "declined" || quote.status === "expired" || quote.bookedAt) {
    return NextResponse.json({ error: "This quote can no longer be accepted" }, { status: 400 });
  }
  if (quote.validUntil && quote.validUntil < new Date().toISOString().slice(0, 10)) {
    await db
      .update(quotes)
      .set({ status: "expired" })
      .where(eq(quotes.id, quote.id));
    return NextResponse.json({ error: "This quote has expired" }, { status: 400 });
  }

  const allTierPricing = quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null;
  const chosenTier = allTierPricing?.[parsed.data.serviceType];
  if (!chosenTier) {
    return NextResponse.json({ error: "Selected service type is not priced on this quote" }, { status: 400 });
  }
  if (parsed.data.recurringServiceType && !allTierPricing?.[parsed.data.recurringServiceType]) {
    return NextResponse.json({ error: "Selected recurring service is not priced on this quote" }, { status: 400 });
  }

  const requestedKeys = parsed.data.addOns.map(({ key }) => key);
  if (new Set(requestedKeys).size !== requestedKeys.length) {
    return NextResponse.json({ error: "Each add-on can only be selected once." }, { status: 400 });
  }

  const addOnEntries = parsed.data.addOns
    .map(({ key, qty }) => {
      const addOn = ADD_ONS.find((item) => item.key === key);
      // A flat add-on is never priced by count — pin qty to 1 no matter what the client
      // sent, so the stored record can't imply "3 baseboards" priced 3x.
      return addOn ? { addOn, qty: addOn.quantified ? qty : 1 } : null;
    })
    .filter((entry): entry is { addOn: (typeof ADD_ONS)[number]; qty: number } => entry !== null);
  // Add-ons without a flat price (e.g. windows, priced per-window after a follow-up
  // call) contribute $0 here — the customer isn't charged an amount we haven't
  // actually confirmed with them. `acceptedAddOns` below is what lets the scheduler
  // still see the request and follow up, even though it added nothing to the total.
  // The total is always recomputed here from the server-side catalogue — a client-sent
  // price or line total is never trusted, since this is an unauthenticated endpoint.
  const addOnTotalCents = addOnEntries.reduce((sum, entry) => sum + addOnLineTotalCents(entry.addOn, entry.qty), 0);
  const finalTotalCents = chosenTier.finalCents + addOnTotalCents;

  const accepted = await db
    .update(quotes)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedServiceType: parsed.data.serviceType,
      acceptedRecurringServiceType: parsed.data.recurringServiceType ?? null,
      acceptedAddOns: addOnEntries.map((entry) => ({ key: entry.addOn.key, qty: entry.qty })),
      totalCents: finalTotalCents,
      signatureName: parsed.data.signatureName,
      signatureAt: new Date(),
      desiredCleaningDate: parsed.data.desiredCleaningDate ?? null,
    })
    .where(and(eq(quotes.id, quote.id), inArray(quotes.status, ["draft", "sent", "viewed"])))
    .returning({ id: quotes.id });

  if (accepted.length === 0) {
    const [current] = await db.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, quote.id)).limit(1);
    return current?.status === "accepted"
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "This quote can no longer be accepted" }, { status: 409 });
  }

  await db.insert(auditLog).values({
    companyId: quote.companyId,
    action: "quote.accepted",
    entityType: "quote",
    entityId: quote.id,
    before: { status: quote.status },
    after: {
      status: "accepted",
      serviceType: parsed.data.serviceType,
      addOns: addOnEntries.map((entry) => entry.addOn.key),
      desiredCleaningDate: parsed.data.desiredCleaningDate ?? null,
      scheduled: false,
    },
  });

  // Delivery to GHL is intentionally deferred until the production API setup is
  // available. The internal notification is idempotent via quote_id's unique index.
  await db.insert(appNotifications).values({
    companyId: quote.companyId,
    type: "quote.accepted",
    title: "Proposal accepted",
    body: "A customer accepted a proposal and is ready for scheduling.",
    href: `/quotes/${quote.id}?booking=1`,
    quoteId: quote.id,
    customerId: quote.customerId,
  }).onConflictDoNothing();

  return NextResponse.json({ ok: true, desiredCleaningDate: parsed.data.desiredCleaningDate ?? null });
}
