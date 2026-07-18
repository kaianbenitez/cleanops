import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { customers, gmailConnections, quotes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SERVICE_TYPES, type PricingBreakdown, type ServiceType } from "@/lib/pricing/calculate";
import { syncToGhl } from "@/lib/ghl/sync";
import { refreshGoogleAccessToken, sendGmailMessage } from "@/lib/gmail/client";

const acceptSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  signatureName: z.string().trim().min(1, "Signature name is required"),
  addOns: z.array(z.string().trim().min(1)).default([]),
});

const SERVICE_LABELS: Record<string, string> = {
  supreme_deep: "Supreme Deep",
  deep: "Deep Clean",
  first_time: "First Time",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  four_weeks: "Every 4 Weeks",
  move_in_out: "Move In / Out",
};

const ADD_ONS: Record<string, { label: string; priceCents: number }> = {
  inside_windows: { label: "Inside windows", priceCents: 4500 },
  oven_interior: { label: "Oven interior", priceCents: 3500 },
  fridge_interior: { label: "Fridge interior", priceCents: 3500 },
  baseboards: { label: "Baseboards", priceCents: 2500 },
  cabinet_fronts: { label: "Cabinet fronts", priceCents: 3000 },
  laundry: { label: "Laundry / folding", priceCents: 5000 },
};

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
  const [customer] = quote
    ? await db
        .select({ firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
        .from(customers)
        .where(eq(customers.id, quote.customerId))
        .limit(1)
    : [];

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.status === "accepted") {
    return NextResponse.json({ ok: true });
  }
  if (quote.status === "declined" || quote.status === "expired") {
    return NextResponse.json({ error: "This quote can no longer be accepted" }, { status: 400 });
  }

  const allTierPricing = quote.allTierPricing as Record<ServiceType, PricingBreakdown> | null;
  const chosenTier = allTierPricing?.[parsed.data.serviceType];
  if (!chosenTier) {
    return NextResponse.json({ error: "Selected service type is not priced on this quote" }, { status: 400 });
  }

  const addOnEntries = parsed.data.addOns
    .map((key) => ADD_ONS[key])
    .filter((addon): addon is { label: string; priceCents: number } => Boolean(addon));
  const addOnTotalCents = addOnEntries.reduce((sum, addon) => sum + addon.priceCents, 0);
  const finalTotalCents = chosenTier.finalCents + addOnTotalCents;

  await db
    .update(quotes)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedServiceType: parsed.data.serviceType,
      totalCents: finalTotalCents,
      signatureName: parsed.data.signatureName,
      signatureAt: new Date(),
    })
    .where(eq(quotes.id, quote.id));

  const [gmailConnection] = await db.select().from(gmailConnections).where(eq(gmailConnections.companyId, quote.companyId)).limit(1);
  if (gmailConnection) {
    const accessToken = await refreshGoogleAccessToken(gmailConnection.refreshToken);

    const admins = await db
      .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.companyId, quote.companyId), eq(users.role, "admin")));

    const recipientEmails = admins.map((admin) => admin.email).filter(Boolean);
    if (recipientEmails.length > 0) {
      const customerLabel = customer ? `${customer.firstName} ${customer.lastName}`.trim() : `Customer ${quote.customerId.slice(0, 8).toUpperCase()}`;
      const subject = `Quote accepted in CleanOps`;
      const addonText = addOnEntries.length
        ? `Add-ons: ${addOnEntries.map((addon) => `${addon.label} (+$${(addon.priceCents / 100).toFixed(2)})`).join(", ")}`
        : "";
      const text = [
        `A quote was accepted in CleanOps.`,
        `Quote ID: ${quote.id}`,
        `Customer: ${customerLabel}`,
        `Service type: ${parsed.data.serviceType}`,
        addonText,
        "",
        `Open CleanOps to view the full record.`,
      ].join("\n");
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10211f">
          <p>A quote was accepted in CleanOps.</p>
          <ul>
            <li><strong>Quote ID:</strong> ${quote.id}</li>
            <li><strong>Customer:</strong> ${customerLabel}</li>
            <li><strong>Service type:</strong> ${parsed.data.serviceType}</li>
            ${addonText ? `<li><strong>Add-ons:</strong> ${escapeHtml(addonText)}</li>` : ""}
          </ul>
          <p>Open CleanOps to view the full record.</p>
        </div>
      `;
      await sendGmailMessage({
        accessToken: accessToken.access_token,
        fromEmail: gmailConnection.senderEmail,
        to: recipientEmails.join(", "),
        subject,
        text,
        html,
        replyTo: gmailConnection.senderEmail,
      });
    }

    if (customer?.email) {
      const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : "there";
      const serviceLabel = SERVICE_LABELS[parsed.data.serviceType] ?? parsed.data.serviceType;
      const customerSubject = `We received your CleanOps quote acceptance`;
      const customerAddonText = addOnEntries.length
        ? `Add-ons: ${addOnEntries.map((addon) => `${addon.label} (+$${(addon.priceCents / 100).toFixed(2)})`).join(", ")}`
        : "";
      const customerText = [
        `Hi ${customerName || "there"},`,
        "",
        `Thanks for accepting your ${serviceLabel} quote.`,
        `We’ve received your signature and our team will follow up to confirm scheduling.${customerAddonText ? `\n${customerAddonText}` : ""}`,
        "",
        "If you have any questions or want to add a service, just reply to this email.",
      ].join("\n");
      const customerHtml = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10211f">
          <p>Hi ${escapeHtml(customerName || "there")},</p>
          <p>Thanks for accepting your ${escapeHtml(serviceLabel)} quote.</p>
          <p>We’ve received your signature and our team will follow up to confirm scheduling.</p>
          ${customerAddonText ? `<p><strong>${escapeHtml(customerAddonText)}</strong></p>` : ""}
          <p>If you have any questions or want to add a service, just reply to this email.</p>
        </div>
      `;
      await sendGmailMessage({
        accessToken: accessToken.access_token,
        fromEmail: gmailConnection.senderEmail,
        to: customer.email,
        subject: customerSubject,
        text: customerText,
        html: customerHtml,
        replyTo: gmailConnection.senderEmail,
      });
    }
  }

  await syncToGhl(quote.companyId, { type: "quote.accepted", customerId: quote.customerId });

  return NextResponse.json({ ok: true });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
