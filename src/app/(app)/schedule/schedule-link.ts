/** Today's current stop routes back to its open ledger event on My Day
 * rather than a context-free job page; every future-dated row keeps its
 * normal job link (State Model §5, WP-D §8.1). Pure so it's testable
 * without pulling in the page's DB/Next.js imports. */
export function scheduleJobHref(jobId: string, scheduledDate: string, todayIso: string) {
  return scheduledDate === todayIso ? "/my-day" : `/my-day/${jobId}`;
}
