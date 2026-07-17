import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/** GET /api/admins — admin accounts for this company, shown on the Settings
 * page so the owner can see who has full access and add more. */
export async function GET() {
  const admin = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.companyId, admin.companyId), eq(users.role, "admin")))
    .orderBy(users.firstName);

  return NextResponse.json({ admins: rows });
}
