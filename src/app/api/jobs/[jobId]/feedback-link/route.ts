import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { jobAssignments, jobs } from "@/db/schema";
import { ensureFeedbackRequest } from "@/lib/feedback/ensure-feedback-request";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await requireUser();
  const { jobId } = await params;
  const [job] = await db.select({ id: jobs.id, status: jobs.status, customerId: jobs.customerId })
    .from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.companyId, user.companyId))).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed") return NextResponse.json({ error: "The customer link is available after the job is completed." }, { status: 400 });
  if (user.role !== "admin") {
    const [assignment] = await db.select({ id: jobAssignments.id }).from(jobAssignments).where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id))).limit(1);
    if (!assignment) return NextResponse.json({ error: "You are not assigned to this job" }, { status: 403 });
  }

  try {
    const result = await ensureFeedbackRequest({ companyId: user.companyId, jobId, origin: req.url });
    const feedbackUrl = new URL(`/feedback/${result.request.publicToken}`, req.url).toString();
    return NextResponse.json({ ok: true, feedbackUrl, resent: result.sent && Boolean(result.request.createdAt) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create feedback link." }, { status: 400 });
  }
}
