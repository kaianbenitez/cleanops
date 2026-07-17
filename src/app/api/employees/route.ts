import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/employees — active employees for assignment pickers (kept minimal —
 * other code depends on this exact shape). For the full directory list with
 * every field, the /employees page queries the DB directly instead. */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.role, "employee"), eq(users.isActive, true)))
    .orderBy(users.firstName);

  return NextResponse.json({ employees: rows });
}

const createEmployeeSchema = z.object({
  role: z.enum(["employee", "admin"]).default("employee"),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payType: z.enum(["commission_jth", "office_hourly"]).optional(),
  hourlyRateCents: z.number().int().nonnegative().optional(),
  gustoEmployeeId: z.string().trim().optional(),
});

/** POST /api/employees — creates a Supabase auth account (temp password, admin
 * shares it out-of-band) plus the profile row. Mirrors the seed script's
 * account-creation pattern but usable from the app itself, not just seeding. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json();
  const parsed = createEmployeeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (data.role === "employee" && (!data.payType || data.hourlyRateCents == null)) {
    return NextResponse.json(
      { error: "Pay type and hourly rate are required for employees." },
      { status: 400 }
    );
  }
  const tempPassword = crypto.randomUUID();

  const supabaseAdmin = createAdminClient();
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create auth account" }, { status: 400 });
  }

  const [employee] = await db
    .insert(users)
    .values({
      id: authUser.user.id,
      companyId: admin.companyId,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      title: data.title,
      birthday: data.birthday,
      hiredDate: data.hiredDate,
      payType: data.role === "employee" ? data.payType : undefined,
      hourlyRateCents: data.role === "employee" ? data.hourlyRateCents : undefined,
      gustoEmployeeId: data.gustoEmployeeId,
      isActive: true,
    })
    .returning();

  return NextResponse.json({ employee, tempPassword }, { status: 201 });
}
