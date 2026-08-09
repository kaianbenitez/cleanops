import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, feedbackRequests, invoices, jobs } from "@/db/schema";
import { syncToGhl } from "@/lib/ghl/sync";
import { sendInvoiceViaSquare } from "@/lib/square/invoicing";

type EnsureFeedbackRequestOptions = {
  companyId: string;
  jobId: string;
  origin: string;
};

/**
 * Creates the one feedback request for a completed job and triggers GHL once.
 * Existing sent requests are reused; submitted requests are never reopened.
 */
export async function ensureFeedbackRequest({
  companyId,
  jobId,
  origin,
}: EnsureFeedbackRequestOptions) {
  const [job] = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      customerId: jobs.customerId,
      customerFirstName: customers.firstName,
      invoiceId: invoices.id,
      invoiceStatus: invoices.status,
      invoiceUrl: invoices.squarePublicUrl,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(invoices, eq(invoices.jobId, jobs.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
    .limit(1);

  if (!job) throw new Error("Job not found");
  if (job.status !== "completed") throw new Error("Feedback is available after the job is completed");

  if (job.invoiceId && job.invoiceStatus === "draft") {
    await sendInvoiceViaSquare(job.invoiceId, companyId);
  }

  let invoiceUrl = job.invoiceUrl;
  if (job.invoiceId && !invoiceUrl) {
    const [invoice] = await db
      .select({ squarePublicUrl: invoices.squarePublicUrl })
      .from(invoices)
      .where(eq(invoices.id, job.invoiceId))
      .limit(1);
    invoiceUrl = invoice?.squarePublicUrl ?? null;
  }

  const [existing] = await db
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.jobId, jobId))
    .limit(1);

  if (existing?.status === "submitted") return { request: existing, sent: false };

  const expired = Boolean(existing && existing.expiresAt < new Date());
  const shouldSend = !existing || expired;
  const token = shouldSend ? randomBytes(32).toString("base64url") : existing.publicToken;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let request;
  if (existing) {
    [request] = await db
      .update(feedbackRequests)
      .set({
        publicToken: token,
        status: "sent",
        expiresAt,
        invoiceUrl,
        updatedAt: new Date(),
      })
      .where(eq(feedbackRequests.id, existing.id))
      .returning();
  } else {
    [request] = await db
      .insert(feedbackRequests)
      .values({
        companyId,
        jobId,
        customerId: job.customerId,
        publicToken: token,
        expiresAt,
        invoiceUrl,
      })
      .returning();
  }

  if (shouldSend) {
    const feedbackUrl = new URL(`/feedback/${token}`, origin).toString();
    await syncToGhl(companyId, {
      type: "post_service_feedback.requested",
      customerId: job.customerId,
      feedbackUrl,
      invoiceUrl,
    });
  }

  return { request, sent: shouldSend };
}
