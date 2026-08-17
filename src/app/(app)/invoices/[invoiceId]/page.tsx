"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";

type Invoice = {
  id: string;
  status: string;
  method: string | null;
  subtotalCents: number | null;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  amountPaidCents: number;
  squareInvoiceId: string | null;
  checkNumber: string | null;
  paymentNote: string | null;
  paidAt: string | null;
  createdAt: string;
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function readableError(body: { error?: unknown }) {
  return typeof body.error === "string" ? body.error : body.error ? JSON.stringify(body.error) : "Something went wrong. Please try again.";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : tone === "bad"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-[var(--co-surface-muted)] text-[var(--co-muted)] border-[var(--co-line-soft)]";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function Panel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="co-card overflow-hidden">
      <div className="border-b border-[var(--co-line-soft)] px-5 py-4 sm:px-6">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--co-muted)]">{description}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Input({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-[var(--co-muted)]">{label}</span>
      {children}
    </label>
  );
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobDate, setJobDate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [tip, setTip] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"check" | "cash">("check");
  const [amountPaid, setAmountPaid] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const load = useCallback(async () => {
    setLoaded(false);
    const response = await fetch(`/api/invoices/${invoiceId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? `Invoice could not be loaded (${response.status}).`);
    }

    const next = data.invoice as Invoice;
    setInvoice(next);
    setCustomerName(`${data.customerFirstName} ${data.customerLastName}`);
    setCustomerEmail(data.customerEmail ?? "");
    setCustomerPhone(data.customerPhone ?? "");
    setJobType(data.jobType ?? "");
    setJobDate(data.jobScheduledDate ?? "");
    setDiscount((next.discountCents / 100).toFixed(2));
    setTip((next.tipCents / 100).toFixed(2));
    setAmountPaid(((next.totalCents - next.amountPaidCents) / 100).toFixed(2));
    setLoaded(true);
  }, [invoiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load server-backed invoice data on mount
    load().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Invoice could not be loaded.");
      setLoaded(true);
    });
  }, [load]);

  const subtotal = invoice?.subtotalCents ?? invoice?.totalCents ?? 0;
  const balance = useMemo(() => (invoice ? Math.max(invoice.totalCents - invoice.amountPaidCents, 0) : 0), [invoice]);
  const isClosed = invoice?.status === "paid" || invoice?.status === "void";
  const invoiceTitle = invoice ? `INV-${invoice.id.slice(0, 6).toUpperCase()}` : "Invoice";

  async function adjust() {
    if (!invoice) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discountCents: Math.round(Number(discount || 0) * 100),
        tipCents: Math.round(Number(tip || 0) * 100),
        subtotalCents: subtotal,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(readableError(body));
    await load().catch(() => undefined);
    setBusy(false);
  }

  async function sendSquare() {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/invoices/${invoiceId}/send`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(readableError(body));
    await load().catch(() => undefined);
    setBusy(false);
  }

  async function sendEmail() {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch(`/api/invoices/${invoiceId}/email`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(readableError(body));
    } else {
      setNotice("Invoice marked sent — GHL will handle the email.");
    }
    await load().catch(() => undefined);
    setBusy(false);
  }

  async function recordPayment() {
    if (!invoice) return;
    const cents = Math.round(Number(amountPaid || 0) * 100);
    if (!cents) {
      setError("Enter an amount paid.");
      return;
    }

    setBusy(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: paymentMethod,
        amountPaidCents: cents,
        tipCents: Math.round(Number(tip || 0) * 100),
        checkNumber: checkNumber || undefined,
        paymentNote: paymentNote || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(readableError(body));
    await load().catch(() => undefined);
    setBusy(false);
  }

  async function recordCheckInFull() {
    if (!invoice) return;
    if (!checkNumber.trim()) {
      setError("Enter the check number first.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/invoices/${invoiceId}/record-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkNumber }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(readableError(body));
    await load().catch(() => undefined);
    setBusy(false);
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--co-line)]" />
        <div className="h-44 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--co-surface)]" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="co-card p-8 text-center">
        <p className="font-medium">Unable to load this invoice.</p>
        <p className="mt-2 text-sm text-rose-600">{error}</p>
        <button className="co-button-secondary mt-5" onClick={() => load()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-0">
      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="min-w-0">
          <Link href="/invoices" className="text-sm font-medium text-[var(--co-accent-text)] hover:underline">
            Back to invoices
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Billing / Invoice</p>
            <Pill tone={invoice.status === "paid" ? "good" : invoice.status === "sent" ? "warn" : "neutral"}>{invoice.status}</Pill>
          </div>
          <h1 className="page-title mt-2">{invoiceTitle}</h1>
          <p className="page-subtitle mt-1">
            {customerName} - Created {formatDate(invoice.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="co-button-secondary">
            Download PDF
          </button>
          {customerEmail ? (
            <button onClick={sendEmail} disabled={busy || !customerEmail} className="co-button-primary">
              {busy ? "Sending..." : "Email invoice"}
            </button>
          ) : null}
          {customerPhone ? (
            <a className="co-button-secondary" href={`sms:${customerPhone}?&body=Invoice ${invoiceTitle} for ${encodeURIComponent(customerName)}`}>
              Text invoice
            </a>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="co-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Invoice total</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{dollars(invoice.totalCents)}</p>
        </div>
        <div className="co-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Amount paid</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-emerald-700">{dollars(invoice.amountPaidCents)}</p>
        </div>
        <div className="co-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Balance due</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--co-accent-text)]">{dollars(balance)}</p>
        </div>
        <div className="co-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--co-muted)]">Payment method</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{invoice.method || "—"}</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <Panel eyebrow="Invoice at a glance" title="Billing summary" description="Quick context for office staff before they send, record, or reconcile payment.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--co-muted)]">Customer</p>
                <p className="mt-2 font-semibold">{customerName}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">{customerEmail || "No email on file"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--co-muted)]">Related job</p>
                <p className="mt-2 font-semibold">{jobType.replaceAll("_", " ") || "Service"}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">{jobDate || "No job date recorded"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--co-muted)]">Open balance</p>
                <p className="mt-2 font-semibold text-[var(--co-accent-text)]">{dollars(balance)}</p>
                <p className="mt-1 text-sm text-[var(--co-muted)]">{invoice.status === "paid" ? "Paid in full" : "Waiting on customer"}</p>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Invoice preview" title="Customer-facing bill" description="This is the document you can print, email, or send through Square.">
            <div className="rounded-3xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-5 shadow-[0_20px_60px_rgba(20,33,31,.04)] print:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--co-line-soft)] pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--co-surface-muted)] font-bold text-[var(--co-accent-text)]">CO</span>
                    <span className="text-lg font-semibold">ServiceSpark</span>
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-[0.1em] text-[var(--co-muted)]">Bill to</p>
                  <p className="mt-1 text-lg font-semibold">{customerName}</p>
                  <p className="mt-1 text-sm text-[var(--co-muted)]">{customerEmail || "No email"}</p>
                  <p className="text-sm text-[var(--co-muted)]">{customerPhone || "No phone"}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{invoiceTitle}</p>
                  <p className="mt-2 text-[var(--co-muted)]">Invoice date</p>
                  <p>{formatDate(invoice.createdAt)}</p>
                  <p className="mt-2 text-[var(--co-muted)]">Job</p>
                  <p>
                    {jobType.replaceAll("_", " ") || "Service"}
                    {jobDate ? ` - ${jobDate}` : ""}
                  </p>
                  {invoice.squareInvoiceId ? <p className="mt-2 text-xs text-[var(--co-muted)]">Square ID: {invoice.squareInvoiceId}</p> : null}
                </div>
              </div>

              <div className="py-6">
                <div className="flex items-center justify-between border-b border-[var(--co-line-soft)] pb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--co-muted)]">
                  <span>Description</span>
                  <span>Amount</span>
                </div>
                <div className="flex items-center justify-between py-4 text-sm">
                  <div>
                    <p className="font-medium">{jobType.replaceAll("_", " ") || "Cleaning service"}</p>
                    <p className="text-xs text-[var(--co-muted)]">ServiceSpark service visit{jobDate ? ` on ${jobDate}` : ""}</p>
                  </div>
                  <span>{dollars(subtotal)}</span>
                </div>
              </div>

              <div className="ml-auto max-w-sm space-y-3 border-t border-[var(--co-line-soft)] pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--co-muted)]">Subtotal</span>
                  <span>{dollars(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--co-muted)]">Discount</span>
                  <span>-{dollars(invoice.discountCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--co-muted)]">Tip</span>
                  <span>{dollars(invoice.tipCents)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--co-line-soft)] pt-3 text-lg font-semibold">
                  <span>Total</span>
                  <span>{dollars(invoice.totalCents)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Amount paid</span>
                  <span>{dollars(invoice.amountPaidCents)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-[var(--co-accent-text)]">
                  <span>Balance due</span>
                  <span>{dollars(balance)}</span>
                </div>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Payment history" title="Activity" description="Keep an audit-friendly record of what happened and when.">
            <div className="space-y-4">
              <div className="flex gap-3 text-sm">
                <span className="mt-1 h-3 w-3 rounded-full bg-[var(--co-accent-fill)]" />
                <div>
                  <p className="font-medium">Invoice created</p>
                  <p className="text-xs text-[var(--co-muted)]">{formatDateTime(invoice.createdAt)}</p>
                </div>
              </div>
              {invoice.status !== "draft" ? (
                <div className="flex gap-3 text-sm">
                  <span className="mt-1 h-3 w-3 rounded-full bg-[var(--co-accent)]" />
                  <div>
                    <p className="font-medium">{invoice.status === "paid" ? "Payment recorded" : "Invoice sent / pending payment"}</p>
                    <p className="text-xs text-[var(--co-muted)]">{formatDateTime(invoice.paidAt) ?? "Awaiting customer payment"}</p>
                  </div>
                </div>
              ) : null}
              {invoice.checkNumber ? (
                <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.08em] text-[var(--co-muted)]">Check number</p>
                  <p className="mt-1 font-medium">{invoice.checkNumber}</p>
                </div>
              ) : null}
              {invoice.paymentNote ? (
                <div className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/40 p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.08em] text-[var(--co-muted)]">Payment note</p>
                  <p className="mt-1">{invoice.paymentNote}</p>
                </div>
              ) : null}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5 print:hidden">
          <Panel eyebrow="Send and share" title="Quick actions" description="Use the path that matches the customer and payment method.">
            <div className="grid gap-2">
              <button onClick={sendSquare} disabled={busy || invoice.status !== "draft"} className="co-button-primary w-full justify-center">
                {busy ? "Sending..." : invoice.status === "draft" ? "Send through Square" : "Already sent"}
              </button>
              <button onClick={() => window.print()} className="co-button-secondary w-full justify-center">
                Download PDF
              </button>
              {customerEmail ? (
                <button onClick={sendEmail} disabled={busy} className="co-button-secondary w-full justify-center">
                  Email to customer
                </button>
              ) : null}
              {customerPhone ? (
                <a className="co-button-secondary w-full text-center" href={`sms:${customerPhone}?&body=Invoice ${invoiceTitle} for ${encodeURIComponent(customerName)}`}>
                  Text to customer
                </a>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-[var(--co-muted)]">
              Square is the cleanest path for credit-card payment. Email/text opens the customer’s own mail or SMS app.
            </p>
          </Panel>

          {!isClosed ? (
            <Panel eyebrow="Record payment" title="Check or cash" description="This supports a partial amount, a full amount, and a separate check-only full settlement.">
              <div className="space-y-3">
                <Input label="Method">
                  <select className="co-input w-full" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "check" | "cash")}>
                    <option value="check">Check</option>
                    <option value="cash">Cash</option>
                  </select>
                </Input>

                <Input label="Amount paid">
                  <input
                    className="co-input w-full"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                    placeholder={dollars(balance)}
                  />
                </Input>

                <Input label="Add tip">
                  <input className="co-input w-full" type="number" min="0" step="0.01" value={tip} onChange={(event) => setTip(event.target.value)} />
                </Input>

                {paymentMethod === "check" ? (
                  <Input label="Check number">
                    <input className="co-input w-full" value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} placeholder="Optional, but helpful" />
                  </Input>
                ) : null}

                <Input label="Payment note">
                  <input className="co-input w-full" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional note" />
                </Input>

                <div className="grid gap-2">
                  <button onClick={recordPayment} disabled={busy} className="co-button-primary w-full justify-center">
                    {busy ? "Recording..." : `Record ${paymentMethod} payment`}
                  </button>
                  {paymentMethod === "check" ? (
                    <button onClick={recordCheckInFull} disabled={busy} className="co-button-secondary w-full justify-center">
                      Mark check paid in full
                    </button>
                  ) : null}
                </div>

                <p className="text-xs text-[var(--co-muted)]">
                  You can enter a partial amount or the full balance. If the customer pays by check, you can also record the full check amount quickly.
                </p>
              </div>
            </Panel>
          ) : null}

          <Panel eyebrow="Adjust totals" title="Discount and invoice tip" description="Available while the invoice is still a draft.">
            <div className="grid gap-3">
              <Input label="Discount">
                <input className="co-input w-full" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
              </Input>
              <Input label="Tip">
                <input className="co-input w-full" type="number" min="0" step="0.01" value={tip} onChange={(event) => setTip(event.target.value)} />
              </Input>
            </div>
            <button onClick={adjust} disabled={busy || invoice.status !== "draft"} className="co-button-secondary mt-4 w-full justify-center">
              {busy ? "Saving..." : invoice.status === "draft" ? "Save discount and tip" : "Locked after send"}
            </button>
          </Panel>

          <Panel eyebrow="Customer contact" title="Reach them directly" description="These links use the stored customer details.">
            <div className="space-y-2 text-sm">
              {customerEmail ? (
                <a className="block font-medium text-[var(--co-accent-text)] hover:underline" href={`mailto:${customerEmail}?subject=Invoice ${invoiceTitle}`}>
                  Email {customerEmail}
                </a>
              ) : (
                <p className="text-[var(--co-muted)]">No email recorded</p>
              )}
              {customerPhone ? (
                <a className="block font-medium text-[var(--co-accent-text)] hover:underline" href={`sms:${customerPhone}`}>
                  Text {customerPhone}
                </a>
              ) : (
                <p className="text-[var(--co-muted)]">No phone recorded</p>
              )}
              <Link href={`/customers?search=${encodeURIComponent(customerName)}`} className="block text-[var(--co-accent-text)] hover:underline">
                Open customer profile
              </Link>
            </div>
          </Panel>
        </aside>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 print:hidden">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
