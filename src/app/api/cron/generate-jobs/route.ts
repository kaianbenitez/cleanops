import { NextRequest, NextResponse } from "next/server";
import { generateJobsForAllActiveSeries } from "@/lib/scheduling/generate-jobs";

/**
 * Cron entrypoint — call daily (Cloudflare Cron Trigger / Vercel Cron) to keep
 * every active recurring series generated 8 weeks ahead. Idempotent: safe to
 * call multiple times a day.
 *
 * Protected by a shared secret rather than session auth, since the caller is
 * an external scheduler, not a logged-in user.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateJobsForAllActiveSeries();
  return NextResponse.json(result);
}
