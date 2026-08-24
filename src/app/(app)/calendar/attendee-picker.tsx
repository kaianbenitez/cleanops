"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

type StaffMember = { id: string; firstName: string; lastName: string };

/** Search-to-add multi-select for meeting attendees — a trimmed variant of
 * TeamSearchPicker without the lead/"Make lead" concept, which doesn't apply
 * to a flat attendee list. Fed the full active staff roster (field + office),
 * not the field-eligible-only list jobs use. */
export default function AttendeePicker({
  staff,
  selectedIds,
  onChange,
  placeholder = "Search staff by name…",
}: {
  staff: StaffMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const selectedStaff = selectedIds.map((id) => staff.find((member) => member.id === id)).filter((member): member is StaffMember => Boolean(member));

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return staff
      .filter((member) => !selectedIds.includes(member.id))
      .filter((member) => !term || `${member.firstName} ${member.lastName}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [staff, selectedIds, query]);

  function add(memberId: string) {
    onChange([...selectedIds, memberId]);
    setQuery("");
  }

  function remove(memberId: string) {
    onChange(selectedIds.filter((id) => id !== memberId));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (matches[0]) add(matches[0].id);
    } else if (event.key === "Backspace" && !query && selectedIds.length) {
      remove(selectedIds[selectedIds.length - 1]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedStaff.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedStaff.map((member) => (
            <span key={member.id} className="flex items-center gap-1.5 rounded-full border border-[var(--co-line)] bg-[var(--co-surface-muted)] py-1 pl-3 pr-1.5 text-xs font-medium">
              {member.firstName} {member.lastName}
              <button type="button" onClick={() => remove(member.id)} aria-label={`Remove ${member.firstName} ${member.lastName}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--co-muted)] hover:bg-[var(--co-surface)] hover:text-[var(--co-danger)]">
                <X className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="co-input w-full"
        aria-label="Search staff to add as attendees"
      />

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-2xl border border-[var(--co-line)] bg-[var(--co-surface)] p-1.5 shadow-[var(--co-shadow-popover)]">
          {matches.length ? (
            matches.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => add(member.id)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-[var(--co-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--co-focus-ring)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--co-surface-muted)] text-[12px] font-bold text-[var(--co-accent-text)]">
                  {member.firstName[0]}
                  {member.lastName[0]}
                </span>
                {member.firstName} {member.lastName}
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-xs text-[var(--co-muted)]">{staff.length === selectedIds.length ? "Everyone is already on this meeting." : "No staff match."}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
