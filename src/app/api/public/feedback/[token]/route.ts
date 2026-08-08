import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, customers, feedbackRequests, jobs } from "@/db/schema";

const submissionSchema = z.object({ qualityRating: z.number().int().min(1).max(5), qualityTags: z.array(z.string().trim().min(1).max(40)).max(8).default([]), qualityComment: z.string().trim().max(2000).optional() });

async function getRequest(token: string) {
  const [row] = await db.select({ request: feedbackRequests, customerFirstName: customers.firstName, companyName: companies.name, jobDate: jobs.scheduledDate })
    .from(feedbackRequests).innerJoin(customers, eq(feedbackRequests.customerId, customers.id)).innerJoin(companies, eq(feedbackRequests.companyId, companies.id)).innerJoin(jobs, eq(feedbackRequests.jobId, jobs.id))
    .where(eq(feedbackRequests.publicToken, token)).limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const row = await getRequest((await params).token);
  if (!row || row.request.expiresAt < new Date()) return NextResponse.json({ error: "This feedback link has expired." }, { status: 410 });
  return NextResponse.json({ customerFirstName: row.customerFirstName, companyName: row.companyName, jobDate: row.jobDate, status: row.request.status, invoiceUrl: row.request.invoiceUrl, submittedAt: row.request.submittedAt });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const row = await getRequest((await params).token);
  if (!row || row.request.expiresAt < new Date()) return NextResponse.json({ error: "This feedback link has expired." }, { status: 410 });
  if (row.request.status === "submitted") return NextResponse.json({ error: "Feedback has already been submitted." }, { status: 409 });
  const parsed = submissionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await db.update(feedbackRequests).set({ ...parsed.data, status: "submitted", submittedAt: new Date(), updatedAt: new Date() }).where(and(eq(feedbackRequests.id, row.request.id), eq(feedbackRequests.status, "sent")));
  return NextResponse.json({ ok: true, invoiceUrl: row.request.invoiceUrl });
}
