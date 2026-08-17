"use client";

import { useState } from "react";
import { Tag } from "lucide-react";

// Common starting points — not a fixed list, admins can type anything.
const SUGGESTED_TAGS = [
  "Organizer",
  "Deep clean expert",
  "Move-out specialist",
  "Detail oriented",
  "Pet friendly",
  "Trainer",
  "Bilingual",
  "Driver",
];

export default function EmployeeTags({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value || tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return;
    if (tags.length >= 12) return;
    onSave([...tags, value]);
    setDraft("");
  }

  function removeTag(value: string) {
    onSave(tags.filter((tag) => tag !== value));
  }

  const unusedSuggestions = SUGGESTED_TAGS.filter((tag) => !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()));

  return (
    <section className="co-card p-5">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-[var(--co-accent-text)]" />
        <h2 className="text-sm font-semibold">Skills &amp; specialties</h2>
      </div>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1.5 rounded-full border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--co-ink)]">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="text-[var(--co-muted)] hover:text-rose-600">
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--co-muted)]">No tags yet — add what this person is especially good at.</p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          addTag(draft);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a tag…"
          maxLength={40}
          disabled={tags.length >= 12}
          className="co-input flex-1 text-xs"
        />
        <button type="submit" disabled={!draft.trim() || tags.length >= 12} className="co-button-secondary px-3 py-2 text-xs disabled:opacity-50">
          Add
        </button>
      </form>

      {unusedSuggestions.length > 0 && tags.length < 12 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {unusedSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="rounded-full border border-dashed border-[var(--co-line-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--co-muted)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-accent-text)]"
            >
              + {tag}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
