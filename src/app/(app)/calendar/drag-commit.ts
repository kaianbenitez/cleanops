export type JobPatch = Partial<{
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number;
  priceCents: number;
  employeeIds: string[];
  status: string;
  cancellationReason: string;
  skipOccurrence: boolean;
}>;

export async function commitJobPatch(
  jobId: string,
  patch: JobPatch,
  handlers: {
    onOptimistic: () => void;
    onSuccess?: () => void;
    onWarning?: (message: string) => void;
    onError: (message: string, retry: () => void) => void;
    onSettled?: () => void;
  }
): Promise<boolean> {
  handlers.onOptimistic();
  try {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(res.status === 409 ? (body?.error ?? "That time overlaps another job.") : "We couldn't save that change. Check your connection and try again.");
    }
    const body = await res.json().catch(() => null);
    if (Array.isArray(body?.warnings) && body.warnings.length) handlers.onWarning?.(body.warnings.join(" "));
    handlers.onSuccess?.();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "We couldn't save that change. Check your connection and try again.";
    handlers.onError(message, () => {
      void commitJobPatch(jobId, patch, handlers);
    });
    return false;
  } finally {
    handlers.onSettled?.();
  }
}
