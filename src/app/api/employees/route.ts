import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_ACCOUNT_PASSWORD, slugifyUsername, usernameToEmail } from "@/lib/auth/username";
import { isValidBirthday } from "@/lib/employees/birthday";

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
  contactEmail: z.string().trim().optional(),
  profilePhotoUrl: z.string().url().optional(),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  birthday: z.string().refine(isValidBirthday, "Birthday must be a valid month and day in MM-DD format.").optional(),
  hiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payType: z.enum(["commission_jth", "office_hourly"]).optional(),
  hourlyRateCents: z.number().int().nonnegative().optional(),
  gustoEmployeeId: z.string().trim().optional(),
});

/** POST /api/employees — creates a Supabase auth account (username =
 * firstname+lastname, default password shared out-of-band by the admin) plus
 * the profile row. Mirrors the seed script's account-creation pattern but
 * usable from the app itself, not just seeding. */
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

  const supabaseAdmin = createAdminClient();
  const baseUsername = slugifyUsername(data.firstName, data.lastName);
  if (!baseUsername) {
    return NextResponse.json({ error: "Could not derive a username from that name." }, { status: 400 });
  }

  let username = baseUsername;
  let authUserId: string | null = null;
  for (let attempt = 1; attempt <= 20 && !authUserId; attempt++) {
    username = attempt === 1 ? baseUsername : `${baseUsername}${attempt}`;
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: DEFAULT_ACCOUNT_PASSWORD,
      email_confirm: true,
    });

    if (authUser?.user) {
      authUserId = authUser.user.id;
    } else if (!authError?.message?.toLowerCase().includes("already been registered")) {
      return NextResponse.json({ error: authError?.message ?? "Failed to create auth account" }, { status: 400 });
    }
  }

  if (!authUserId) {
    return NextResponse.json({ error: "Could not find an available username after 20 attempts." }, { status: 409 });
  }

  const [employee] = await db
    .insert(users)
    .values({
      id: authUserId,
      companyId: admin.companyId,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      email: usernameToEmail(username),
      contactEmail: data.contactEmail,
      profilePhotoUrl: data.profilePhotoUrl,
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

  return NextResponse.json({ employee, username, password: DEFAULT_ACCOUNT_PASSWORD }, { status: 201 });
}
