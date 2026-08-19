export type MyDaySelectableJob = { jobId: string };

/**
 * Completed jobs belong in history, never in the primary action card. An open
 * time entry always wins, followed by the cleaner's explicit pending choice.
 */
export function pickMyDayActiveJob<T extends MyDaySelectableJob>({
  currentJob,
  openEntryJobId,
  selectedJobId,
  todayJobs,
  upcomingJobs,
}: {
  currentJob: T | null;
  openEntryJobId: string | null;
  selectedJobId: string | null;
  todayJobs: T[];
  upcomingJobs: T[];
}): T | null {
  const pendingJobs = [...todayJobs, ...upcomingJobs];

  if (openEntryJobId) {
    return pendingJobs.find((job) => job.jobId === openEntryJobId)
      ?? (currentJob?.jobId === openEntryJobId ? currentJob : null);
  }

  if (selectedJobId) {
    const selectedPendingJob = pendingJobs.find((job) => job.jobId === selectedJobId);
    if (selectedPendingJob) return selectedPendingJob;
  }

  return currentJob ?? todayJobs[0] ?? upcomingJobs[0] ?? null;
}
