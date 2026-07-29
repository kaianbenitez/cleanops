import { randomBytes } from "crypto";

// Supabase Auth requires an email-shaped identifier, but CleanOps logs
// employees in with a plain username. We store `<username>@cleanops.local`
// as the Auth/DB email and strip the suffix everywhere it's displayed.
const USERNAME_DOMAIN = "cleanops.local";

/** One-time temporary password for a newly created (or admin-reset) account.
 * Random per account — never reused — since it's shown once and the
 * recipient is required to replace it (`users.mustChangePassword`). */
export function generateTemporaryPassword() {
  return randomBytes(9).toString("base64url"); // 12 url-safe chars, ~72 bits of entropy
}

export function slugifyUsername(firstName: string, lastName: string) {
  return `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function usernameToEmail(username: string) {
  return `${username}@${USERNAME_DOMAIN}`;
}

export function emailToUsername(email: string) {
  const suffix = `@${USERNAME_DOMAIN}`;
  return email.toLowerCase().endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
