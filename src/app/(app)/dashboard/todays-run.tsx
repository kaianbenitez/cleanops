import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import { getTodaysRun } from "@/lib/dashboard/queries";

function formatTime(value: string | null) {
  if (!value) return "No time";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function formatCleaningType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function TodaysRun({
  companyId,
  todayIso,
}: {
  companyId: string;
  todayIso: string;
}) {
  const run = await getTodaysRun(companyId, todayIso);
  return (
    <section className="co-card overflow-hidden">
      <div className="px-4 py-3">
        <h2 className="text-lg font-semibold">Today&apos;s run</h2>
        <p className="text-sm text-[var(--co-muted)]">
          {run.scheduled} scheduled &middot; {run.completed} completed &middot;{" "}
          {run.atRisk} at risk
        </p>
      </div>
      {run.jobs.length ? (
        <>
        <div className="divide-y divide-[var(--co-line-soft)] border-t border-[var(--co-line-soft)] sm:hidden">
          {run.jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="block px-4 py-4 focus-visible:bg-[var(--co-surface-muted)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--co-ink)]">{job.customerName}</p>
                  <p className="mt-1 text-sm text-[var(--co-muted)]">{formatTime(job.scheduledStartTime)} · {formatCleaningType(job.type)}</p>
                </div>
                <StatusPill domain="job" status={job.status} />
              </div>
              <p className="mt-2 truncate text-sm text-[var(--co-muted)]">{job.address}</p>
              <p className="mt-1 text-sm text-[var(--co-muted)]">{job.assignedTo.join(", ") || "Unassigned"}</p>
            </Link>
          ))}
        </div>
        <div className="hidden overflow-x-auto border-t border-[var(--co-line-soft)] sm:block">
          <table className="w-full min-w-[840px] text-left text-sm">
            <caption className="sr-only">Today&apos;s scheduled jobs</caption>
            <thead className="bg-[var(--co-surface-muted)] text-xs font-medium text-[var(--co-muted)]">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Time
                </th>
                <th scope="col" className="px-4 py-3">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3">
                  Cleaning type
                </th>
                <th scope="col" className="px-4 py-3">
                  Location
                </th>
                <th scope="col" className="px-4 py-3">
                  Cleaner(s)
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--co-line-soft)]">
              {run.jobs.map((job) => (
                <tr
                  key={job.id}
                  className="group relative hover:bg-[var(--co-surface-muted)]"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--co-muted)]">
                    {formatTime(job.scheduledStartTime)}
                  </td>
                  <th
                    scope="row"
                    className="px-4 py-3 font-medium text-[var(--co-ink)]"
                  >
                    <Link
                      href={`/jobs/${job.id}`}
                      className="before:absolute before:inset-0 before:content-[''] focus-visible:before:outline focus-visible:before:outline-3 focus-visible:before:outline-[var(--co-focus-ring)] focus-visible:before:outline-offset-[-3px]"
                    >
                      {job.customerName}
                      <span className="sr-only">, view job details</span>
                    </Link>
                  </th>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatCleaningType(job.type)}
                  </td>
                  <td className="min-w-52 px-4 py-3 text-[var(--co-muted)]">
                    {job.address}
                  </td>
                  <td className="min-w-40 px-4 py-3 text-[var(--co-muted)]">
                    {job.assignedTo.join(", ") || "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill domain="job" status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <p className="border-t border-[var(--co-line-soft)] px-4 py-6 text-sm">
          No jobs are scheduled for today.
        </p>
      )}
    </section>
  );
}
