import { NextRequest, NextResponse } from "next/server";
import { generateJobsForAllActiveSeries } from "@/lib/scheduling/generate-jobs";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Cron entrypoint — call daily (Vercel Cron) to keep every active recurring
 * series generated 8 weeks ahead. Idempotent: safe to call multiple times a
 * day.
 *
 * Protected by a shared secret rather than session auth, since the caller is
 * an external scheduler, not a logged-in user. GET is what Vercel's Cron
 * Jobs actually send; POST is kept for manual/external-scheduler calls.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateJobsForAllActiveSeries();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
