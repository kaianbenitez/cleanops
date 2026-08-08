import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers, feedbackRequests, invoices, jobAssignments, jobs } from "@/db/schema";
import { syncToGhl } from "@/lib/ghl/sync";
import { sendInvoiceViaSquare } from "@/lib/square/invoicing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await requireUser();
  const { jobId } = await params;
  const [job] = await db.select({ id: jobs.id, status: jobs.status, customerId: jobs.customerId, customerFirstName: customers.firstName, invoiceId: invoices.id, invoiceStatus: invoices.status, invoiceUrl: invoices.squarePublicUrl })
    .from(jobs).innerJoin(customers, eq(jobs.customerId, customers.id)).leftJoin(invoices, eq(invoices.jobId, jobs.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, user.companyId))).limit(1);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed") return NextResponse.json({ error: "The customer link is available after the job is completed." }, { status: 400 });
  // If the office already created a draft invoice, publish it before sending
  // the customer link so Square can collect the balance, tip, and receipt.
  if (job.invoiceId && job.invoiceStatus === "draft") await sendInvoiceViaSquare(job.invoiceId, user.companyId);
  let invoiceUrl = job.invoiceUrl;
  if (job.invoiceId && !invoiceUrl) {
    const [invoice] = await db.select({ squarePublicUrl: invoices.squarePublicUrl }).from(invoices).where(eq(invoices.id, job.invoiceId)).limit(1);
    invoiceUrl = invoice?.squarePublicUrl ?? null;
  }
  if (user.role !== "admin") {
    const [assignment] = await db.select({ id: jobAssignments.id }).from(jobAssignments).where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id))).limit(1);
    if (!assignment) return NextResponse.json({ error: "You are not assigned to this job" }, { status: 403 });
  }

  const [existing] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.jobId, jobId)).limit(1);
  if (existing?.status === "submitted") return NextResponse.json({ error: "Customer feedback has already been submitted." }, { status: 409 });
  const expired = Boolean(existing && existing.expiresAt < new Date());
  const token = !existing || expired ? randomBytes(32).toString("base64url") : existing.publicToken;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (existing) {
    await db.update(feedbackRequests).set({ publicToken: token, status: "sent", expiresAt, invoiceUrl, updatedAt: new Date() }).where(eq(feedbackRequests.id, existing.id));
  } else {
    await db.insert(feedbackRequests).values({ companyId: user.companyId, jobId, customerId: job.customerId, publicToken: token, expiresAt, invoiceUrl });
  }
  const feedbackUrl = new URL(`/feedback/${token}`, req.url).toString();
  await syncToGhl(user.companyId, { type: "post_service_feedback.requested", customerId: job.customerId, feedbackUrl, invoiceUrl });
  return NextResponse.json({ ok: true, feedbackUrl, customerFirstName: job.customerFirstName, resent: Boolean(existing) });
}
