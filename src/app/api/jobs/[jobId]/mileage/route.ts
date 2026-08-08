import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, jobAssignments, jobs } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

const schema = z.object({ mileageMiles: z.number().finite().nonnegative(), note: z.string().trim().max(500).nullable().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await requireUser();
  const { jobId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [assignment] = await db
    .select({ id: jobAssignments.id, mileageMiles: jobAssignments.mileageMiles, role: jobAssignments.role })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, user.id), eq(jobs.companyId, user.companyId)))
    .limit(1);
  if (!assignment) return NextResponse.json({ error: "Job assignment not found" }, { status: 404 });
  if (assignment.role !== "lead" && user.role !== "admin") return NextResponse.json({ error: "Only the lead / driver can submit mileage." }, { status: 403 });

  await db.update(jobAssignments).set({ mileageMiles: parsed.data.mileageMiles.toFixed(2) }).where(eq(jobAssignments.id, assignment.id));
  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    action: "job_assignment.mileage_updated",
    entityType: "job_assignment",
    entityId: assignment.id,
    before: { mileageMiles: assignment.mileageMiles },
    after: { mileageMiles: parsed.data.mileageMiles, note: parsed.data.note ?? null },
  });
  return NextResponse.json({ ok: true });
}
