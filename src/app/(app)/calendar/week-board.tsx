"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_STYLES,
  hourLabel,
  minutesFromTime,
  employeeColor,
  assignDayLanes,
  formatClockLabel,
  isPlainClick,
  STAFF_RANGE_START,
  STAFF_RANGE_MINUTES,
} from "./shared";
import { commitJobPatch } from "./drag-commit";
import { useUndoToast, UndoToast } from "./undo-toast";
import JobDetailPanel from "./job-detail-panel";

type Employee = { id: string; firstName: string; lastName: string };
type DayMeta = { iso: string; label: string; dayNum: number; isToday: boolean };

type WeekJob = {
  id: string;
  type: string;
  status: string;
  scheduledDate: string;
  scheduledStartTime: string | null;
  estimatedDurationMinutes: number | null;
  recurringSeriesId: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerZip: string | null;
  assignedUserIds: string[];
};

const LOCKED_STATUSES = ["completed", "cancelled", "no_show"];
const HOURS = 12;
const ROW_PX = 72;
const TOTAL_HEIGHT = HOURS * ROW_PX;

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export default function WeekBoard({ days, employees, jobs: initialJobs }: { days: DayMeta[]; employees: Employee[]; jobs: WeekJob[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [syncedJobs, setSyncedJobs] = useState(initialJobs);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const { toast, showUndo, dismiss } = useUndoToast();

  if (initialJobs !== syncedJobs) {
    setSyncedJobs(initialJobs);
    setJobs(initialJobs);
  }

  const byDate = new Map<string, WeekJob[]>();
  jobs.forEach((job) => byDate.set(job.scheduledDate, [...(byDate.get(job.scheduledDate) ?? []), job]));

  const laneInfo = new Map<string, { lanes: Map<string, { lane: number; laneCount: number }>; maxLaneCount: number }>();
  days.forEach((day) => {
    const dayJobs = byDate.get(day.iso) ?? [];
    const lanes = assignDayLanes(dayJobs);
    const maxLaneCount = Math.max(1, ...Array.from(lanes.values()).map((l) => l.laneCount));
    laneInfo.set(day.iso, { lanes, maxLaneCount });
  });

  const columnTemplate = `64px ${days.map((day) => `minmax(${Math.max(140, (laneInfo.get(day.iso)?.maxLaneCount ?? 1) * 95)}px, 1fr)`).join(" ")}`;

  function handleDrop(event: React.DragEvent<HTMLDivElement>, targetDate: string) {
    event.preventDefault();
    setDragOverDate(null);
    const jobId = event.dataTransfer.getData("text/plain");
    if (!jobId) return;
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || LOCKED_STATUSES.includes(job.status)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    const rawMinutes = STAFF_RANGE_START + pct * STAFF_RANGE_MINUTES;
    const snapped = Math.round(rawMinutes / 15) * 15;
    const clampedStart = Math.min(Math.max(snapped, STAFF_RANGE_START), STAFF_RANGE_START + STAFF_RANGE_MINUTES);
    const newTime = formatTime(clampedStart);

    if (job.scheduledDate === targetDate && job.scheduledStartTime === newTime) return;

    if (job.recurringSeriesId && job.scheduledDate !== targetDate) {
      const conflict = jobs.some(
        (candidate) => candidate.id !== job.id && candidate.recurringSeriesId === job.recurringSeriesId && candidate.scheduledDate === targetDate
      );
      if (conflict) {
        setError("This recurring series already has a job scheduled on that date.");
        return;
      }
    }

    const previousDate = job.scheduledDate;
    const previousTime = job.scheduledStartTime;
    const targetLabel = days.find((day) => day.iso === targetDate)?.label ?? targetDate;

    commitJobPatch(
      jobId,
      { scheduledDate: targetDate, scheduledStartTime: newTime },
      {
        onOptimistic: () => {
          setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledDate: targetDate, scheduledStartTime: newTime } : candidate)));
          setSavingId(jobId);
          setError(null);
        },
        onSuccess: () => {
          router.refresh();
          showUndo(`Moved ${job.customerFirstName} ${job.customerLastName} to ${targetLabel} at ${formatClockLabel(newTime)}`, () => {
            commitJobPatch(jobId, { scheduledDate: previousDate, scheduledStartTime: previousTime ?? undefined }, {
              onOptimistic: () => setJobs((prev) => prev.map((candidate) => (candidate.id === jobId ? { ...candidate, scheduledDate: previousDate, scheduledStartTime: previousTime } : candidate))),
              onSuccess: () => router.refresh(),
              onError: (message) => {
                setError(message);
                router.refresh();
              },
            });
          });
        },
        onError: (message) => {
          setError(message);
          router.refresh();
        },
        onSettled: () => setSavingId(null),
      }
    );
  }

  return (
    <div className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
        <p className="eyebrow">Week view</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-1 text-lg font-semibold">Time-board schedule</h2>
            <p className="mt-1 text-xs text-[var(--co-muted)]">Drag a job to reschedule it, or drop it on another day to move it there.</p>
          </div>
          <span className="rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/50 px-3 py-1 text-xs font-medium text-[var(--co-evergreen)]">
            {jobs.length} jobs in view
          </span>
        </div>
        {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1100px] p-4">
          <div className="grid" style={{ gridTemplateColumns: columnTemplate }}>
            <div />
            {days.map((day) => (
              <div
                key={day.iso}
                className={`border-b border-l border-[var(--co-line-soft)] px-3 py-2 text-center ${day.isToday ? "bg-[var(--co-surface-muted)]/70" : "bg-white"}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--co-muted)]">{day.label.slice(0, 3)}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--co-ink)]">{day.dayNum}</p>
              </div>
            ))}

            <div className="relative border-b border-[var(--co-line-soft)]" style={{ height: TOTAL_HEIGHT }}>
              {Array.from({ length: HOURS }, (_, index) => 7 + index).map((hour, index) => (
                <div key={hour} className="absolute right-2 pt-1 text-right text-[11px] font-medium text-[var(--co-muted)]" style={{ top: index * ROW_PX }}>
                  {hourLabel(hour * 60)}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const dayJobs = byDate.get(day.iso) ?? [];
              const { lanes } = laneInfo.get(day.iso) ?? { lanes: new Map() };
              return (
                <div
                  key={day.iso}
                  className={`relative border-b border-l border-[var(--co-line-soft)] transition-colors ${
                    dragOverDate === day.iso ? "bg-emerald-50" : day.isToday ? "bg-[var(--co-surface-muted)]/30" : "bg-white"
                  }`}
                  style={{ height: TOTAL_HEIGHT }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverDate !== day.iso) setDragOverDate(day.iso);
                  }}
                  onDragLeave={() => setDragOverDate((current) => (current === day.iso ? null : current))}
                  onDrop={(event) => handleDrop(event, day.iso)}
                >
                  {Array.from({ length: HOURS }, (_, index) => index).map((index) => (
                    <div key={index} className="absolute w-full border-b border-[var(--co-line-soft)]" style={{ top: index * ROW_PX }} />
                  ))}
                  {dayJobs.map((job) => {
                    const startMinutes = minutesFromTime(job.scheduledStartTime);
                    const duration = Math.max(job.estimatedDurationMinutes ?? 75, 45);
                    const top = ((startMinutes - STAFF_RANGE_START) / 60) * ROW_PX + 4;
                    const height = Math.max((duration / 60) * ROW_PX - 8, 42);
                    const accent = employeeColor(job.assignedUserIds[0] ?? null);
                    const { lane, laneCount } = lanes.get(job.id) ?? { lane: 0, laneCount: 1 };
                    const laneWidth = 100 / laneCount;
                    const locked = LOCKED_STATUSES.includes(job.status);
                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        onClick={(event) => {
                          if (!isPlainClick(event)) return;
                          event.preventDefault();
                          setDetailJobId(job.id);
                        }}
                        draggable={!locked}
                        onDragStart={(event) => {
                          if (locked) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.setData("text/plain", job.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className={`absolute overflow-hidden rounded-2xl border px-3 py-2 text-left text-xs shadow-[0_10px_24px_rgba(27,41,37,0.06)] transition-transform ${
                          locked ? "cursor-default opacity-70" : "cursor-grab hover:-translate-y-0.5 hover:z-10 active:cursor-grabbing"
                        } ${STATUS_STYLES[job.status] ?? "border-slate-200 bg-slate-50"} ${savingId === job.id ? "opacity-50" : ""}`}
                        style={{
                          top: `${Math.max(top, 6)}px`,
                          height: `${height}px`,
                          left: `calc(${lane * laneWidth}% + 2px)`,
                          width: `calc(${laneWidth}% - 4px)`,
                          borderLeftWidth: "4px",
                          borderLeftColor: accent,
                        }}
                      >
                        <div className="truncate font-semibold">
                          {job.scheduledStartTime?.slice(0, 5)} {job.customerFirstName} {job.customerLastName}
                        </div>
                        {laneCount === 1 ? <div className="mt-1 truncate text-[10px] opacity-75">{job.customerZip ?? "No zip"}</div> : null}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <UndoToast toast={toast} onDismiss={dismiss} />
      <JobDetailPanel jobId={detailJobId} employees={employees} onClose={() => setDetailJobId(null)} />
    </div>
  );
}
