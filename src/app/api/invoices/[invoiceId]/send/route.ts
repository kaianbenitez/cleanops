import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendInvoiceViaSquare } from "@/lib/square/invoicing";

/** POST /api/invoices/[invoiceId]/send — creates + publishes a Square invoice
 * for this CleanOps invoice (PLAN.md §6: Customers API upsert -> Invoices API
 * create+publish). Mock mode when SQUARE_ACCESS_TOKEN is unset. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const admin = await requireAdmin();
  const { invoiceId } = await params;

  const [invoice] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId)))
    .limit(1);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be sent" }, { status: 400 });
  }

  const result = await sendInvoiceViaSquare(invoiceId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
