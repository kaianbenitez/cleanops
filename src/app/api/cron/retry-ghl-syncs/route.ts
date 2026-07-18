import { NextRequest, NextResponse } from "next/server";
import { retryFailedSyncs } from "@/lib/ghl/sync";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/** Cron entrypoint — retries every 'retrying' GHL sync, exponential-backoff-free
 * (simple fixed-interval retry via cron cadence) up to 5 attempts before giving
 * up and marking 'failed' for the admin sync-issues screen. Same auth pattern
 * as /api/cron/generate-jobs (shared secret header, external scheduler caller).
 * GET is what Vercel's Cron Jobs actually send; POST is kept for manual calls. */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await retryFailedSyncs();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
