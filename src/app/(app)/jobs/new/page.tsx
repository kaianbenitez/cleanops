import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadNewJobOptions } from "@/lib/jobs/new-job-data";
import NewJobForm from "./new-job-form";

export default async function NewJobPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // POST /api/jobs is admin-only; gate the form the same way rather than
  // letting a technician fill it in and fail on submit. The "Job" entry in
  // CreateMenu is already admin-only, but this route can still be reached
  // directly by URL.
  if (user.role !== "admin") redirect("/my-day");

  const options = await loadNewJobOptions(user.companyId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Operations / Jobs</p>
          <h1 className="page-title mt-2">New job</h1>
          <p className="page-subtitle">Create a service visit, assign the team, and place it on the calendar.</p>
        </div>
        <Link href="/jobs" className="co-button-secondary">
          ← Back to jobs
        </Link>
      </header>

      <NewJobForm {...options} />
    </div>
  );
}
