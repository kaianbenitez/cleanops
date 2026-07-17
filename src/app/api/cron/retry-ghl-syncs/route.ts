import { NextRequest, NextResponse } from "next/server";
import { retryFailedSyncs } from "@/lib/ghl/sync";

/** Cron entrypoint — retries every 'retrying' GHL sync, exponential-backoff-free
 * (simple fixed-interval retry via cron cadence) up to 5 attempts before giving
 * up and marking 'failed' for the admin sync-issues screen. Same auth pattern
 * as /api/cron/generate-jobs (shared secret header, external scheduler caller). */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await retryFailedSyncs();
  return NextResponse.json(result);
}
