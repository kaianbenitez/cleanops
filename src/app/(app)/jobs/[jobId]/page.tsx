import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadAssignableEmployees, loadJobDetail } from "@/lib/jobs/job-detail";
import JobDetailClient from "./job-detail-client";
import type { AuditEntry } from "./types";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Job detail is the office view; technicians get their own workflow in My Day.
  if (user.role !== "admin") redirect("/my-day");

  const [detail, employees] = await Promise.all([
    loadJobDetail(jobId, user.companyId),
    loadAssignableEmployees(user.companyId),
  ]);

  if (!detail) notFound();

  // Newest activity first, job and time-entry history interleaved.
  const auditLogs: AuditEntry[] = [...detail.jobAuditLogs, ...detail.timeEntryAuditLogs]
    .map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      editorFirstName: log.editorFirstName,
      editorLastName: log.editorLastName,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <JobDetailClient
      job={detail.job}
      employees={employees}
      assignments={detail.assignments.map((assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        role: assignment.role,
      }))}
      timeEntries={detail.timeEntries.map((entry) => ({
        ...entry,
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut ? entry.clockOut.toISOString() : null,
      }))}
      auditLogs={auditLogs}
    />
  );
}
