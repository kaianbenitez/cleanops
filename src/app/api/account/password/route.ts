import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/admin";

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirmPassword: z.string().min(8, "Please confirm the password."),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

/** POST /api/account/password — lets the signed-in user set their own
 * password. Deliberately uses `requireAuthenticatedUser` (not `requireUser`)
 * so this stays reachable while `mustChangePassword` is still set — this is
 * the only route that can clear it. */
export async function POST(req: NextRequest) {
  const user = await requireAuthenticatedUser();
  const parsed = passwordSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password." }, { status: 400 });
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
    password: parsed.data.password,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));

  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    action: "user.password_changed",
    entityType: "user",
    entityId: user.id,
    before: null,
    after: { method: "self_service" },
  });

  return NextResponse.json({ ok: true });
}
