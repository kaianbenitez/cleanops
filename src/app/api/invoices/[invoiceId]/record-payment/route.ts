import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, invoices } from "@/db/schema";

const schema = z.object({ method: z.enum(["check", "cash"]), amountPaidCents: z.number().int().positive(), tipCents: z.number().int().nonnegative().optional(), checkNumber: z.string().trim().max(100).optional(), paymentNote: z.string().trim().max(1000).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const admin = await requireAdmin();
  const { invoiceId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, admin.companyId))).limit(1);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid" || invoice.status === "void") return NextResponse.json({ error: `Invoice is already ${invoice.status}` }, { status: 400 });
  const tipCents = parsed.data.tipCents ?? invoice.tipCents;
  const totalCents = (invoice.subtotalCents ?? invoice.totalCents) - invoice.discountCents + tipCents;
  const balanceDueCents = Math.max(totalCents - invoice.amountPaidCents, 0);
  if (parsed.data.amountPaidCents > balanceDueCents) return NextResponse.json({ error: `Payment cannot exceed the remaining balance of $${(balanceDueCents / 100).toFixed(2)}.` }, { status: 400 });
  const amountPaidCents = invoice.amountPaidCents + parsed.data.amountPaidCents;
  const paid = amountPaidCents >= totalCents;
  const [updated] = await db.update(invoices).set({ status: paid ? "paid" : "sent", method: parsed.data.method, tipCents, totalCents, amountPaidCents, checkNumber: parsed.data.checkNumber ?? null, paymentNote: parsed.data.paymentNote ?? null, paidAt: paid ? new Date() : null, updatedAt: new Date() }).where(eq(invoices.id, invoiceId)).returning();
  await db.insert(auditLog).values({ companyId: admin.companyId, userId: admin.id, action: "invoice.payment_recorded", entityType: "invoice", entityId: invoiceId, before: { status: invoice.status, amountPaidCents: invoice.amountPaidCents, tipCents: invoice.tipCents }, after: { status: updated.status, amountPaidCents: updated.amountPaidCents, tipCents: updated.tipCents, method: updated.method } });
  return NextResponse.json({ invoice: updated });
}
