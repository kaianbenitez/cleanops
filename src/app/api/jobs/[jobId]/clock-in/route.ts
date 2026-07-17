import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/db";
import { jobs, jobAssignments, timeEntries } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await requireUser();
  const { jobId } = await params;

  const [assignment] = await db
    .select()
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id)))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const result = await db.transaction(async (tx) => {
    const [openEntry] = await tx
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.jobId, jobId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOut)))
      .limit(1);
    if (openEntry) return false;
    await tx.update(jobs).set({ status: "in_progress" }).where(eq(jobs.id, jobId));
    await tx.insert(timeEntries).values({
      jobId,
      userId: user.id,
      clockIn: new Date(),
    });
    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "You already have an open time entry for this job" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
