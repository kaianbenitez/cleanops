import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, gmailConnections, invoices } from "@/db/schema";
import { refreshGoogleAccessToken, sendGmailMessage } from "@/lib/gmail/client";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const admin = await requireAdmin();
  const { invoiceId } = await params;

  const [row] = await db
    .select({
      invoice: invoices,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!row.customerEmail) {
    return NextResponse.json({ error: "Customer does not have an email address on file." }, { status: 400 });
  }

  const [gmailConnection] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.companyId, admin.companyId))
    .limit(1);

  if (!gmailConnection) {
    return NextResponse.json({ error: "Connect Gmail in Settings before sending invoices by email." }, { status: 400 });
  }

  const invoiceTitle = `INV-${row.invoice.id.slice(0, 6).toUpperCase()}`;
  const customerName = `${row.customerFirstName} ${row.customerLastName}`.trim();
  const subtotal = row.invoice.subtotalCents ?? row.invoice.totalCents;
  const balance = Math.max(row.invoice.totalCents - row.invoice.amountPaidCents, 0);
  const subject = `Invoice ${invoiceTitle} from CleanOps`;
  const publicUrl = new URL(`/invoices/${invoiceId}`, req.url).toString();
  const text = [
    `Hi ${customerName || "there"},`,
    "",
    `Your invoice ${invoiceTitle} is ready.`,
    `Total: ${dollars(row.invoice.totalCents)}`,
    `Paid: ${dollars(row.invoice.amountPaidCents)}`,
    `Balance due: ${dollars(balance)}`,
    "",
    `View your invoice: ${publicUrl}`,
    "",
    "Reply to this email if you have any questions.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10211f">
      <p>Hi ${escapeHtml(customerName || "there")},</p>
      <p>Your invoice <strong>${escapeHtml(invoiceTitle)}</strong> is ready.</p>
      <p>
        Total: ${escapeHtml(dollars(row.invoice.totalCents))}<br />
        Paid: ${escapeHtml(dollars(row.invoice.amountPaidCents))}<br />
        Balance due: ${escapeHtml(dollars(balance))}
      </p>
      <p><a href="${publicUrl}">View your invoice</a></p>
      <p>Reply to this email if you have any questions.</p>
    </div>
  `;

  const accessToken = await refreshGoogleAccessToken(gmailConnection.refreshToken);
  await sendGmailMessage({
    accessToken: accessToken.access_token,
    fromEmail: gmailConnection.senderEmail,
    to: row.customerEmail,
    subject,
    text,
    html,
    replyTo: gmailConnection.senderEmail,
  });

  const [updated] = await db
    .update(invoices)
    .set({
      status: row.invoice.status === "draft" ? "sent" : row.invoice.status,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  await db.insert(auditLog).values({
    companyId: admin.companyId,
    userId: admin.id,
    action: "invoice.emailed",
    entityType: "invoice",
    entityId: invoiceId,
    before: { status: row.invoice.status, email: row.customerEmail },
    after: { status: updated.status, email: row.customerEmail, senderEmail: gmailConnection.senderEmail, subject, subtotalCents: subtotal, balanceCents: balance },
  });

  await db
    .update(gmailConnections)
    .set({ lastUsedAt: new Date() })
    .where(eq(gmailConnections.companyId, admin.companyId));

  return NextResponse.json({ ok: true, emailedViaGmail: true });
}
