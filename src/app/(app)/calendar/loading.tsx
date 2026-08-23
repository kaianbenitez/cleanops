// Date navigation and filter changes are full RSC round-trips. The toolbar's
// own controls wrap their navigation in a transition and show a quiet
// "Updating…" cue (calendar-toolbar.tsx, date-picker.tsx, filter-bar.tsx), so
// this only renders for a cold entry into /calendar — a direct hit or a jump
// in from elsewhere in the app. It mirrors the real layout: toolbar card,
// then the attention rail beside the board grid.
export default function CalendarLoading() {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">Loading calendar</span>
      <div
        className="-mx-3 -mt-4 min-h-[calc(100dvh-64px)] animate-pulse bg-[var(--co-bg)] sm:-mx-4 lg:-mx-5 lg:-mt-5 xl:-mx-6"
        aria-hidden
      >
        <section className="co-card mx-3 mt-3 overflow-hidden sm:mx-4 lg:mx-5">
          <div className="border-b border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 lg:px-5">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-11 rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-[170px] rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-11 rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-16 rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-[248px] rounded-lg bg-[var(--co-surface-muted)]" />
              <div className="h-9 w-[68px] rounded-lg bg-[var(--co-surface-muted)]" />
            </div>
          </div>
        </section>

        <div className="grid gap-3.5 p-3 sm:p-4 lg:p-5 xl:grid-cols-[286px_minmax(0,1fr)]">
          <div className="co-card h-[520px] overflow-hidden">
            <div className="border-b border-[var(--co-line-soft)] px-[15px] py-[13px]">
              <div className="h-4 w-36 rounded bg-[var(--co-surface-muted)]" />
              <div className="mt-2 h-3 w-full rounded bg-[var(--co-surface-muted)]" />
            </div>
            <div className="space-y-2 p-[9px]">
              <div className="h-[86px] rounded-[10px] border border-[var(--co-line)] bg-[var(--co-surface-muted)]/50" />
              <div className="h-[86px] rounded-[10px] border border-[var(--co-line)] bg-[var(--co-surface-muted)]/50" />
              <div className="h-[86px] rounded-[10px] border border-[var(--co-line)] bg-[var(--co-surface-muted)]/50" />
            </div>
          </div>

          <div className="co-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--co-line-soft)] px-4 py-3">
              <div className="h-5 w-48 rounded bg-[var(--co-surface-muted)]" />
              <div className="h-3.5 w-64 rounded bg-[var(--co-surface-muted)]" />
            </div>
            <div className="grid grid-cols-[58px_repeat(5,minmax(0,1fr))]">
              <div className="border-b border-r border-[var(--co-line)] py-[9px]" />
              {[0, 1, 2, 3, 4].map((lane) => (
                <div key={lane} className="border-b border-r border-[var(--co-line)] px-[11px] py-[9px]">
                  <div className="h-3.5 w-24 rounded bg-[var(--co-surface-muted)]" />
                  <div className="mt-[6px] h-1 w-full rounded-full bg-[var(--co-surface-muted)]" />
                </div>
              ))}
              <div className="border-r border-[var(--co-line)]" style={{ height: 448 }} />
              {[0, 1, 2, 3, 4].map((lane) => (
                <div key={lane} className="border-r border-[var(--co-line-soft)] p-1" style={{ height: 448 }}>
                  <div className="mt-[64px] h-[122px] rounded-lg bg-[var(--co-surface-muted)]" />
                  <div className="mt-[68px] h-[96px] rounded-lg bg-[var(--co-surface-muted)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
