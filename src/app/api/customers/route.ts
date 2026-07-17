import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/customers — minimal list for pickers (full Customers screen is a later phase). */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      status: customers.status,
    })
    .from(customers)
    .where(eq(customers.companyId, admin.companyId))
    .orderBy(customers.lastName, customers.firstName);

  return NextResponse.json({ customers: rows });
}

const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  zip: z.string().trim().max(20).optional(),
  ghlContactId: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const parsed = createCustomerSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  if (data.ghlContactId) {
    const [existing] = await db
      .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(eq(customers.ghlContactId, data.ghlContactId))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: `This GHL contact is already linked to ${existing.firstName} ${existing.lastName} in CleanOps.` },
        { status: 409 }
      );
    }
  }

  const [customer] = await db.insert(customers).values({
    companyId: admin.companyId,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    addressLine1: data.addressLine1 || null,
    city: data.city || null,
    state: data.state || null,
    zip: data.zip || null,
    ghlContactId: data.ghlContactId || null,
    status: "lead",
  }).returning();
  return NextResponse.json({ customer }, { status: 201 });
}
