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
    <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-[var(--co-line)] bg-[var(--co-faint)] px-5 py-3 text-sm text-[var(--co-surface)] shadow-[var(--co-shadow-toast)]">
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => {
          toast.undo();
          onDismiss();
        }}
        className="font-semibold text-[var(--co-surface)] hover:underline"
      >
        Undo
      </button>
    </div>
  );
}
