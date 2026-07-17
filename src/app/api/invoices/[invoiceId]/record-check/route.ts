import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, invoices } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const recordCheckSchema = z.object({
  checkNumber: z.string().trim().min(1),
});

/** POST /api/invoices/[invoiceId]/record-check — manual check payment, per
 * PLAN.md's "checks recorded manually" (no payment processing of our own). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const admin = await requireAdmin();
  const { invoiceId } = await params;
  const body = await req.json();
  const parsed = recordCheckSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status, totalCents: invoices.totalCents })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId)))
    .limit(1);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid" || invoice.status === "void") {
    return NextResponse.json({ error: `Invoice is already ${invoice.status}` }, { status: 400 });
  }

  await db
    .update(invoices)
    .set({
      status: "paid",
      method: "check",
      checkNumber: parsed.data.checkNumber,
      amountPaidCents: invoice.totalCents,
      paidAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  await db.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "invoice.payment_recorded", entityType: "invoice", entityId: invoiceId, before: { status: invoice.status }, after: { status: "paid", method: "check", amountPaidCents: invoice.totalCents, checkNumber: parsed.data.checkNumber } });

  return NextResponse.json({ ok: true });
}
