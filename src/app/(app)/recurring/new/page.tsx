import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadNewSeriesOptions } from "@/lib/recurring/new-series-data";
import NewSeriesForm from "./new-series-form";

export default async function NewRecurringSeriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Creating a series is an office action — `POST /api/recurring-series` is
  // admin-only, so gate the form the same way rather than letting a technician
  // fill it in and fail on submit.
  if (user.role !== "admin") redirect("/my-day");

  const options = await loadNewSeriesOptions(user.companyId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Operations / Schedule</p>
          <h1 className="page-title mt-2">New recurring series</h1>
          <p className="page-subtitle">Set the repeat pattern once, then let Shimmer generate the upcoming visits.</p>
        </div>
        <Link href="/calendar" className="co-button-secondary">
          ← Back to calendar
        </Link>
      </header>

      <NewSeriesForm {...options} />
    </div>
  );
}
