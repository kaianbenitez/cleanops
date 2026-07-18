import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, customers, invoices } from "@/db/schema";
import { syncToGhl } from "@/lib/ghl/sync";

/** POST /api/invoices/[invoiceId]/email — marks an invoice sent. Comms
 * (email/SMS) are handled by GHL, not this app — this flips the status and
 * fires the invoice-sent GHL sync so the configured GHL workflow can send
 * the actual email. */
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

  const publicUrl = new URL(`/invoices/${invoiceId}`, req.url).toString();

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
    after: { status: updated.status, email: row.customerEmail },
  });

  await syncToGhl(admin.companyId, { type: "invoice.sent", customerId: row.invoice.customerId, invoiceUrl: publicUrl });

  return NextResponse.json({ ok: true });
}
