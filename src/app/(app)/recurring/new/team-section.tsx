"use client";

import TeamSearchPicker from "@/components/team-search-picker";
import type { SeriesEmployeeOption } from "@/lib/recurring/new-series-data";

/** Default crew copied onto every generated visit.
 *
 * Order matters: `generateJobsForSeries` assigns index 0 the `lead` role and
 * everyone after as `helper`, so the picker's "Make lead" control is the only
 * way to choose who leads. The old checkbox grid set the lead by whichever box
 * happened to be ticked first, which was invisible to the admin. */
export default function TeamSection({
  employees,
  selectedEmployeeIds,
  onChange,
}: {
  employees: SeriesEmployeeOption[];
  selectedEmployeeIds: string[];
  onChange: (employeeIds: string[]) => void;
}) {
  return (
    <section className="co-card p-5">
      <p className="eyebrow">Default team</p>
      <h2 className="mt-1 text-lg font-semibold">Who usually cleans this?</h2>
      <p className="mt-1 text-sm text-[var(--co-muted)]">
        Assigned to every generated visit. Leave empty to assign each visit from Calendar instead.
      </p>

      <div className="mt-5">
        <TeamSearchPicker employees={employees} selectedIds={selectedEmployeeIds} onChange={onChange} />
      </div>
    </section>
  );
}
