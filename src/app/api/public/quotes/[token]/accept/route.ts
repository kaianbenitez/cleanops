import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { ADD_ONS } from "@/lib/pricing/add-ons";
import { syncToGhl } from "@/lib/ghl/sync";

const RECURRING_SERVICE_TYPES = ["weekly", "biweekly", "four_weeks"] as const;

const acceptSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  signatureName: z.string().trim().min(1, "Signature name is required"),
  addOns: z.array(z.string().trim().min(1)).default([]),
  recurringServiceType: z.enum(RECURRING_SERVICE_TYPES).nullable().optional(),
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
    return NextResponse.json({ ok: true });
  }
  if (quote.status === "declined" || quote.status === "expired") {
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

  const addOnEntries = parsed.data.addOns
    .map((key) => ADD_ONS.find((addOn) => addOn.key === key))
    .filter((addon): addon is (typeof ADD_ONS)[number] => Boolean(addon));
  // Add-ons without a flat price (e.g. windows, priced per-window after a follow-up
  // call) contribute $0 here — the customer isn't charged an amount we haven't
  // actually confirmed with them. `acceptedAddOns` below is what lets the scheduler
  // still see the request and follow up, even though it added nothing to the total.
  const addOnTotalCents = addOnEntries.reduce((sum, addon) => sum + (addon.priceCents ?? 0), 0);
  const finalTotalCents = chosenTier.finalCents + addOnTotalCents;

  const accepted = await db
    .update(quotes)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedServiceType: parsed.data.serviceType,
      acceptedRecurringServiceType: parsed.data.recurringServiceType ?? null,
      acceptedAddOns: addOnEntries.map((addon) => addon.key),
      totalCents: finalTotalCents,
      signatureName: parsed.data.signatureName,
      signatureAt: new Date(),
    })
    .where(and(eq(quotes.id, quote.id), inArray(quotes.status, ["draft", "sent", "viewed"])))
    .returning({ id: quotes.id });

  if (accepted.length === 0) {
    const [current] = await db.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, quote.id)).limit(1);
    return current?.status === "accepted"
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "This quote can no longer be accepted" }, { status: 409 });
  }

  await syncToGhl(quote.companyId, { type: "quote.accepted", customerId: quote.customerId });

  return NextResponse.json({ ok: true });
}
