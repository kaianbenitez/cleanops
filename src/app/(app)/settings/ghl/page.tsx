"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TagMap = {
  quoteGiven: string;
  quoteAccepted: string;
  firstCleanBooked: string;
  firstCleanDone: string;
  client: string;
  lost: string;
  moved: string;
  invoiceSent: string;
};

type WorkflowMap = {
  newLead: string;
  quoteSent: string;
  quoteViewed: string;
  quoteAccepted: string;
  firstCleanBooked: string;
  firstCleanCompleted: string;
  client: string;
  lost: string;
  moved: string;
  invoiceSent: string;
};

const DEFAULT_TAG_MAP: TagMap = {
  quoteGiven: "quote-given",
  quoteAccepted: "quote-accepted",
  firstCleanBooked: "first-clean-booked",
  firstCleanDone: "first-clean-done",
  client: "client",
  lost: "lost",
  moved: "moved",
  invoiceSent: "invoice-sent",
};

const DEFAULT_WORKFLOW_MAP: WorkflowMap = {
  newLead: "",
  quoteSent: "",
  quoteViewed: "",
  quoteAccepted: "",
  firstCleanBooked: "",
  firstCleanCompleted: "",
  client: "",
  lost: "",
  moved: "",
  invoiceSent: "",
};

const FIELD_LABELS: Array<{ key: keyof TagMap; label: string; hint: string }> = [
  { key: "quoteGiven", label: "Quote sent", hint: "Applied when a proposal is marked sent." },
  { key: "quoteAccepted", label: "Quote accepted", hint: "Applied when the customer accepts a proposal." },
  { key: "firstCleanBooked", label: "First clean booked", hint: "Applied when a first-clean visit is scheduled." },
  { key: "firstCleanDone", label: "First clean completed", hint: "Use this to trigger your post-clean review workflow." },
  { key: "client", label: "Became a client", hint: "Applied when a quote converts into recurring work." },
  { key: "lost", label: "Lost", hint: "Applied when a prospect is marked lost." },
  { key: "moved", label: "Moved", hint: "Applied when a customer is marked moved." },
  { key: "invoiceSent", label: "Invoice sent", hint: "Applied when an invoice is marked sent — trigger your invoice-email workflow off this." },
];

const WORKFLOW_LABELS: Array<{ key: keyof WorkflowMap; label: string; hint: string }> = [
  { key: "newLead", label: "New lead", hint: "Workflow for incoming prospects from GHL webhooks." },
  { key: "quoteSent", label: "Quote sent", hint: "Workflow after a proposal is emailed." },
  { key: "quoteViewed", label: "Quote viewed", hint: "Workflow after a proposal is opened." },
  { key: "quoteAccepted", label: "Quote accepted", hint: "Workflow after the customer accepts." },
  { key: "firstCleanBooked", label: "First clean booked", hint: "Workflow after the first visit is scheduled." },
  { key: "firstCleanCompleted", label: "First clean completed", hint: "Workflow after the first service is done." },
  { key: "client", label: "Became client", hint: "Workflow when recurring service starts." },
  { key: "lost", label: "Lost", hint: "Workflow for lost prospects." },
  { key: "moved", label: "Moved", hint: "Workflow for moved customers." },
  { key: "invoiceSent", label: "Invoice sent", hint: "Workflow that emails the invoice to the customer." },
];

type GhlTestStatus = {
  ok: boolean;
  reason?: string;
  status?: number;
};

/** Values that appear on more than one status are ambiguous once GHL applies
 * the tag — an automation filtering on it can no longer tell which CleanOps
 * status triggered it. */
function findDuplicateValues<T extends Record<string, string>>(
  map: T,
  labels: Array<{ key: keyof T; label: string }>
): Map<keyof T, string> {
  const labelsByValue = new Map<string, Array<{ key: keyof T; label: string }>>();
  for (const entry of labels) {
    const value = map[entry.key].trim();
    if (!value) continue;
    const list = labelsByValue.get(value) ?? [];
    list.push(entry);
    labelsByValue.set(value, list);
  }

  const conflicts = new Map<keyof T, string>();
  for (const [value, entries] of labelsByValue) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      const otherLabels = entries
        .filter((other) => other.key !== entry.key)
        .map((other) => other.label)
        .join(", ");
      conflicts.set(entry.key, `"${value}" is also used by ${otherLabels}`);
    }
  }
  return conflicts;
}

export default function GhlSettingsPage() {
  const [tagMap, setTagMap] = useState<TagMap>(DEFAULT_TAG_MAP);
  const [workflowMap, setWorkflowMap] = useState<WorkflowMap>(DEFAULT_WORKFLOW_MAP);
  const [loading, setLoading] = useState(true);
  const [savingTags, setSavingTags] = useState(false);
  const [savingWorkflows, setSavingWorkflows] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [ghlTest, setGhlTest] = useState<GhlTestStatus | null>(null);
  const [testingGhl, setTestingGhl] = useState(false);

  const tagConflicts = useMemo(() => findDuplicateValues(tagMap, FIELD_LABELS), [tagMap]);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        const existingTags = data.company?.settings?.ghlTagMap as Partial<TagMap> | undefined;
        const existingWorkflows = data.company?.settings?.ghlWorkflowMap as Partial<WorkflowMap> | undefined;
        setTagMap({ ...DEFAULT_TAG_MAP, ...existingTags });
        setWorkflowMap({ ...DEFAULT_WORKFLOW_MAP, ...existingWorkflows });
        setLoading(false);
      })
      .catch(() => {
        setMessage("Could not load GHL settings.");
        setMessageIsError(true);
        setLoading(false);
      });
  }, []);

  async function saveMap(
    field: "ghlTagMap" | "ghlWorkflowMap",
    value: TagMap | WorkflowMap,
    setSaving: (saving: boolean) => void,
    successMessage: string
  ) {
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSaving(false);
    setMessage(response.ok ? successMessage : "Could not save GHL settings.");
    setMessageIsError(!response.ok);
  }

  async function saveTags() {
    if (tagConflicts.size > 0) {
      setMessage("Fix duplicate tags before saving — see the highlighted fields below.");
      setMessageIsError(true);
      return;
    }
    await saveMap("ghlTagMap", tagMap, setSavingTags, "GHL tag map saved.");
  }

  async function saveWorkflows() {
    await saveMap("ghlWorkflowMap", workflowMap, setSavingWorkflows, "GHL workflow map saved.");
  }

  async function testGhlConnection() {
    setTestingGhl(true);
    setGhlTest(null);
    try {
      const response = await fetch("/api/integrations/ghl/test");
      const body = (await response.json().catch(() => ({}))) as GhlTestStatus;
      setGhlTest(body);
    } finally {
      setTestingGhl(false);
    }
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading GHL settings…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Settings / Integrations</p>
          <h1 className="page-title mt-2">GHL integration</h1>
          <p className="page-subtitle">Keep ServiceSpark status changes aligned with the tags and workflows your GoHighLevel account uses.</p>
        </div>
        <Link href="/settings" className="co-button-secondary">← Settings</Link>
      </header>

      <section className="co-card flex items-start gap-4 border-[#d9e5cf] bg-[var(--co-surface-muted)] p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--co-evergreen)] text-sm font-black text-[var(--co-accent)]">GHL</span>
        <div>
          <p className="font-semibold">Connection boundary is ready</p>
          <p className="mt-1 text-sm leading-6 text-[var(--co-muted)]">
            The tag names and workflow IDs below are saved in ServiceSpark so your test subaccount can route leads, quote events, and completed jobs to the right automations.
          </p>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Workflow mapping</p>
          <h2 className="mt-1 text-lg font-semibold">Status → tag</h2>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {FIELD_LABELS.map(({ key, label, hint }) => {
            const conflict = tagConflicts.get(key);
            return (
              <label key={key} className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr]">
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--co-muted)]">{hint}</span>
                </span>
                <span>
                  <input
                    className={`co-input w-full font-mono text-sm ${conflict ? "border-rose-300 bg-rose-50" : ""}`}
                    value={tagMap[key]}
                    onChange={(event) => setTagMap((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  {conflict ? <span className="mt-1 block text-xs text-rose-700">{conflict}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-5 py-4">
          <p className="text-xs text-[var(--co-muted)]">
            {tagConflicts.size > 0
              ? "Duplicate tags make status transitions ambiguous in GHL — each status needs its own tag."
              : "Changes affect future outbound sync events."}
          </p>
          <button onClick={saveTags} disabled={savingTags || tagConflicts.size > 0} className="co-button-primary">
            {savingTags ? "Saving…" : "Save tag map"}
          </button>
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--co-line-soft)] px-5 py-4">
          <div>
            <p className="eyebrow">GHL smoke test</p>
            <h2 className="mt-1 text-lg font-semibold">Verify the test subaccount</h2>
            <p className="mt-1 text-sm text-[var(--co-muted)]">
              Confirms ServiceSpark can reach GHL with the configured API key and location ID — run
              it here after editing tags or workflows above.
            </p>
          </div>
          <button onClick={testGhlConnection} disabled={testingGhl} className="co-button-primary">
            {testingGhl ? "Testing…" : "Test GHL connection"}
          </button>
        </div>
        <div className="px-5 py-5 text-sm">
          {ghlTest ? (
            <div
              className={`rounded-2xl border px-4 py-3 ${ghlTest.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}
            >
              <p className="font-semibold">
                {ghlTest.ok ? "GHL connection looks good." : "GHL connection needs attention."}
              </p>
              <p className="mt-1 text-xs leading-5 opacity-80">
                {ghlTest.reason ??
                  (ghlTest.ok
                    ? "The configured API key and location responded successfully."
                    : "The test request did not succeed.")}
              </p>
              {ghlTest.status ? <p className="mt-2 text-xs opacity-70">Status: {ghlTest.status}</p> : null}
            </div>
          ) : (
            <p className="text-[var(--co-muted)]">
              This only confirms the connection — it does not verify that the tag names and
              workflow IDs below exist in your GHL account. Check GHL directly for that.
            </p>
          )}
        </div>
      </section>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Workflow mapping</p>
          <h2 className="mt-1 text-lg font-semibold">Status → workflow</h2>
        </div>
        <div className="divide-y divide-[var(--co-line-soft)]">
          {WORKFLOW_LABELS.map(({ key, label, hint }) => (
            <label key={key} className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr]">
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--co-muted)]">{hint}</span>
              </span>
              <input
                className="co-input w-full font-mono text-sm"
                value={workflowMap[key]}
                onChange={(event) => setWorkflowMap((current) => ({ ...current, [key]: event.target.value }))}
                placeholder="Workflow ID or leave blank"
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 px-5 py-4">
          <p className="text-xs text-[var(--co-muted)]">Leave a field blank to skip that automation.</p>
          <button onClick={saveWorkflows} disabled={savingWorkflows} className="co-button-primary">
            {savingWorkflows ? "Saving…" : "Save workflow map"}
          </button>
        </div>
      </section>

      {message ? (
        <p className={`text-sm font-medium ${messageIsError ? "text-rose-700" : "text-[var(--co-evergreen)]"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
