// Supabase Auth requires an email-shaped identifier, but CleanOps logs
// employees in with a plain username. We store `<username>@cleanops.local`
// as the Auth/DB email and strip the suffix everywhere it's displayed.
const USERNAME_DOMAIN = "cleanops.local";

export const DEFAULT_ACCOUNT_PASSWORD = "password123";

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
