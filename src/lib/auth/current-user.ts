import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CurrentUser = typeof users.$inferSelect;

/** Server-side helper: resolves the authenticated Supabase user to our app-level
 * `users` row (with company/role). Returns null if not authenticated or no profile row. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [profile] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
  return profile ?? null;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Forbidden: admin role required");
  }
  if (user.mustChangePassword) {
    throw new Error("PasswordChangeRequired");
  }
  return user;
}

/** Any authenticated user, regardless of `mustChangePassword` — only for the
 * self-service password-change route, which must stay reachable for an
 * account that's gated on it. Everything else should use `requireUser`. */
export async function requireAuthenticatedUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await requireAuthenticatedUser();
  if (user.mustChangePassword) {
    throw new Error("PasswordChangeRequired");
  }
  return user;
}
