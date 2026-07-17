import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, invoices, customers, jobs } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const updateInvoiceSchema = z.object({
  subtotalCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  tipCents: z.number().int().nonnegative().optional(),
});

export async function GET(
  _req: NextRequest,
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
      jobType: jobs.type,
      jobScheduledDate: jobs.scheduledDate,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({
    invoice: row.invoice,
    customerFirstName: row.customerFirstName,
    customerLastName: row.customerLastName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    jobType: row.jobType,
    jobScheduledDate: row.jobScheduledDate,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const admin = await requireAdmin();
  const { invoiceId } = await params;
  const parsed = updateInvoiceSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId))).limit(1);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status !== "draft") return NextResponse.json({ error: "Only draft invoices can be adjusted" }, { status: 400 });
  const subtotal = parsed.data.subtotalCents ?? invoice.subtotalCents ?? invoice.totalCents;
  const discount = parsed.data.discountCents ?? invoice.discountCents;
  const tip = parsed.data.tipCents ?? invoice.tipCents;
  if (discount > subtotal) return NextResponse.json({ error: "Discount cannot exceed subtotal" }, { status: 400 });
  const [updated] = await db.update(invoices).set({ subtotalCents: subtotal, discountCents: discount, tipCents: tip, totalCents: subtotal - discount + tip, updatedAt: new Date() }).where(eq(invoices.id, invoiceId)).returning();
  await db.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "invoice.adjusted", entityType: "invoice", entityId: invoiceId, before: { subtotalCents: invoice.subtotalCents, discountCents: invoice.discountCents, tipCents: invoice.tipCents, totalCents: invoice.totalCents }, after: { subtotalCents: updated.subtotalCents, discountCents: updated.discountCents, tipCents: updated.tipCents, totalCents: updated.totalCents } });
  return NextResponse.json({ invoice: updated });
}
