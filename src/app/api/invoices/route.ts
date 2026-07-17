import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { invoices, customers, jobs } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  totalCents: z.number().int().positive(),
});

/** GET /api/invoices — list, most recent first, with customer/job context. */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      method: invoices.method,
      totalCents: invoices.totalCents,
      paidAt: invoices.paidAt,
      createdAt: invoices.createdAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      jobType: jobs.type,
      jobScheduledDate: jobs.scheduledDate,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(eq(invoices.companyId, admin.companyId))
    .orderBy(desc(invoices.createdAt));

  return NextResponse.json({ invoices: rows });
}

/** POST /api/invoices — creates a draft invoice, typically from a completed job. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createInvoiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, data.customerId), eq(customers.companyId, admin.companyId)))
    .limit(1);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId: admin.companyId,
      customerId: data.customerId,
      jobId: data.jobId,
      status: "draft",
      subtotalCents: data.totalCents,
      totalCents: data.totalCents,
    })
    .returning();

  return NextResponse.json({ invoice }, { status: 201 });
}
