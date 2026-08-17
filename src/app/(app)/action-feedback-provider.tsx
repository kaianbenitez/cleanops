"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type FeedbackTone = "success" | "error";
type FeedbackItem = { id: number; tone: FeedbackTone; message: string };

function describeAction(url: string, method: string) {
  const path = new URL(url, window.location.origin).pathname;

  if (/\/api\/quotes\/[^/]+\/convert$/.test(path)) return "Work scheduled.";
  if (/\/api\/quotes\/[^/]+\/send$/.test(path)) return "Quote sent.";
  if (/^\/api\/jobs\/?$/.test(path) && method === "POST") return "Job created.";
  if (/^\/api\/jobs\//.test(path)) return method === "DELETE" ? "Job deleted." : "Job updated.";
  if (/^\/api\/customers\//.test(path)) return method === "DELETE" ? "Customer deleted." : "Customer saved.";
  if (/^\/api\/employees\//.test(path)) return method === "DELETE" ? "Employee deleted." : "Employee saved.";
  if (/^\/api\/invoices\//.test(path)) return method === "DELETE" ? "Invoice deleted." : "Invoice saved.";
  if (/^\/api\/settings\//.test(path)) return "Settings saved.";

  return method === "DELETE" ? "Changes deleted." : "Changes saved.";
}

async function readError(response: Response) {
  const body = await response.clone().json().catch(() => null);
  return typeof body?.error === "string" ? body.error : "Could not save changes.";
}

/**
 * Provides confirmation for every data-changing request made within the office
 * app. Individual screens still own detailed inline validation and undo flows;
 * this keeps the cross-app acknowledgement consistent.
 */
export default function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const add = useCallback((tone: FeedbackTone, message: string) => {
    const id = ++nextId.current;
    setItems((current) => [...current.slice(-2), { id, tone, message }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
  }, [dismiss]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const isMutation = method !== "GET" && method !== "HEAD" && new URL(url, window.location.origin).pathname.startsWith("/api/");

      try {
        const response = await originalFetch(input, init);
        if (isMutation) {
          if (response.ok) add("success", describeAction(url, method));
          else add("error", await readError(response));
        }
        return response;
      } catch (error) {
        if (isMutation) add("error", "Could not reach the server. Please try again.");
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [add]);

  return (
    <>
      {children}
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-5">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-3 text-sm shadow-[0_2px_8px_rgba(15,23,20,0.12)] ${
              item.tone === "success"
                ? "border-[var(--co-success)]/30 bg-[var(--co-surface)] text-[var(--co-ink)]"
                : "co-badge-danger"
            }`}
          >
            {item.tone === "success" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-accent-text)]" /> : <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-danger)]" />}
            <p className="min-w-0 flex-1 font-medium">{item.message}</p>
            <button type="button" onClick={() => dismiss(item.id)} className="-mr-1 -mt-1 rounded p-1 text-[var(--co-muted)] hover:bg-black/5 hover:text-[var(--co-ink)]" aria-label="Dismiss notification">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
