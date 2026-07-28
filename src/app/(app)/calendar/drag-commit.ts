export type JobPatch = Partial<{
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number;
  employeeIds: string[];
  status: string;
}>;

export async function commitJobPatch(
  jobId: string,
  patch: JobPatch,
  handlers: {
    onOptimistic: () => void;
    onSuccess?: () => void;
    onWarning?: (message: string) => void;
    onError: (message: string) => void;
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
      throw new Error(res.status === 409 ? (body?.error ?? "That slot conflicts with another job.") : "Couldn't save that move.");
    }
    const body = await res.json().catch(() => null);
    if (Array.isArray(body?.warnings) && body.warnings.length) handlers.onWarning?.(body.warnings.join(" "));
    handlers.onSuccess?.();
    return true;
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : "Couldn't save that move.");
    return false;
  } finally {
    handlers.onSettled?.();
  }
}
