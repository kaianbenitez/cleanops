"use client";

import { useEffect, useState } from "react";

export type UndoToastState = { message: string; undo: () => void } | null;

export function useUndoToast() {
  const [toast, setToast] = useState<UndoToastState>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function showUndo(message: string, undo: () => void) {
    setToast({ message, undo });
  }

  function dismiss() {
    setToast(null);
  }

  return { toast, showUndo, dismiss };
}

export function UndoToast({ toast, onDismiss }: { toast: UndoToastState; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-[var(--co-line)] bg-[var(--co-ink)] px-5 py-3 text-sm text-white shadow-[0_20px_40px_rgba(15,23,20,0.25)]">
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => {
          toast.undo();
          onDismiss();
        }}
        className="font-semibold text-[var(--co-on-dark-accent)] hover:underline"
      >
        Undo
      </button>
    </div>
  );
}
