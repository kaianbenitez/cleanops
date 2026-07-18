import { NextRequest } from "next/server";

/**
 * Cron callers vary by host: Vercel's built-in Cron Jobs always send
 * `Authorization: Bearer <secret>` on a GET request, while a manual/external
 * scheduler (or curl) might send the `x-cron-secret` header on a POST. Accept
 * either so the same route works regardless of what ends up triggering it.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${process.env.CRON_SECRET}`) return true;

  const customHeader = req.headers.get("x-cron-secret");
  return !!customHeader && customHeader === process.env.CRON_SECRET;
}
