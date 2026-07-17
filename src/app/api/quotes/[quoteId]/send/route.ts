import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers, gmailConnections, quotes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { syncToGhl } from "@/lib/ghl/sync";
import { refreshGoogleAccessToken, sendGmailMessage } from "@/lib/gmail/client";

/** POST /api/quotes/[quoteId]/send — marks a quote sent. Comms (email/SMS) are
 * handled by GHL, not this app (per PLAN.md) — this flips the status, fires the
 * quote-given GHL sync (PLAN.md §6) so the "quote given not booked" workflow can
 * pick it up, and returns the link for the admin to hand off to GHL. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  const admin = await requireAdmin();
  const { quoteId } = await params;

  const [quote] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.companyId, admin.companyId)))
    .limit(1);

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const [customer] = await db
    .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, quote.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer?.email) {
    return NextResponse.json({ error: "Customer does not have an email address on file." }, { status: 400 });
  }

  const [gmailConnection] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.companyId, admin.companyId))
    .limit(1);

  const publicUrl = new URL(`/quote/${quote.publicToken}`, req.url).toString();
  const subject = `Your CleanOps quote is ready`;
  const customerName = `${customer.firstName} ${customer.lastName}`.trim();
  const text = [
    `Hi ${customerName || "there"},`,
    "",
    "Your CleanOps quote is ready.",
    publicUrl,
    "",
    "Reply to this email if you have any questions.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10211f">
      <p>Hi ${escapeHtml(customerName || "there")},</p>
      <p>Your CleanOps quote is ready.</p>
      <p><a href="${publicUrl}">${publicUrl}</a></p>
      <p>Reply to this email if you have any questions.</p>
    </div>
  `;

  if (gmailConnection) {
    const accessToken = await refreshGoogleAccessToken(gmailConnection.refreshToken);
    await sendGmailMessage({
      accessToken: accessToken.access_token,
      fromEmail: gmailConnection.senderEmail,
      to: customer.email,
      subject,
      text,
      html,
      replyTo: gmailConnection.senderEmail,
    });

    await db
      .update(gmailConnections)
      .set({ lastUsedAt: new Date() })
      .where(eq(gmailConnections.companyId, admin.companyId));
  }

  await db
    .update(quotes)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(quotes.id, quoteId));

  await syncToGhl(admin.companyId, { type: "quote.sent", customerId: quote.customerId, quoteUrl: publicUrl });

  return NextResponse.json({ ok: true, publicUrl, emailedViaGmail: Boolean(gmailConnection) });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
