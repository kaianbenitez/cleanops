import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const admin = await requireAdmin();
  const { jobId } = await params;

  const [job] = await db
    .select({
      id: jobs.id,
      scheduledDate: jobs.scheduledDate,
      scheduledStartTime: jobs.scheduledStartTime,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      addressLine1: customers.addressLine1,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, admin.companyId)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
