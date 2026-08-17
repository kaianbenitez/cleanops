"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

type FieldName = "businessName" | "contactName" | "email" | "phone" | "crewSize" | "message" | "companyWebsite";
type LeadFormData = Record<FieldName, string>;
const LEADS_TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const initialForm: LeadFormData = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  crewSize: "",
  message: "",
  companyWebsite: "",
};

export default function LeadForm() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  function update(name: FieldName, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // crewSize is optional at the API layer (existing product decision, not
    // touched here), but the landing page's required set is business name,
    // email, and crew size, so enforce that client-side.
    if (!form.crewSize) {
      setErrors((current) => ({ ...current, crewSize: "Select a crew size." }));
      return;
    }

    setSubmitting(true);
    setServerError(null);

    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        contactName: form.contactName || null,
        phone: form.phone || null,
        crewSize: form.crewSize || null,
        message: form.message || null,
        turnstileToken: captchaToken,
      }),
    }).catch(() => null);

    if (response?.ok) {
      setSubmitted(true);
      return;
    }

    const result = await response?.json().catch(() => null);
    const fieldErrors = result?.fieldErrors as Partial<Record<FieldName, string[]>> | undefined;
    if (fieldErrors) {
      setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages?.[0]])));
    } else {
      setServerError("We couldn't send your request right now. Please try again.");
    }
    setSubmitting(false);
    turnstileRef.current?.reset();
    setCaptchaToken(null);
  }

  if (submitted) {
    return (
      <div ref={successRef} role="status" tabIndex={-1} className="rounded-xl border border-[color-mix(in_srgb,var(--co-success)_35%,var(--co-line))] bg-[color-mix(in_srgb,var(--co-success)_8%,var(--co-surface))] p-6">
        <h3 className="text-lg font-semibold text-[var(--co-ink)]">Thanks, we&apos;ll be in touch.</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--co-muted)]">We&apos;ve received your early-access request.</p>
      </div>
    );
  }

  const inputClass = (name: FieldName) => `co-input mt-1 w-full bg-white ${errors[name] ? "border-rose-500" : ""}`;

  return (
    <form noValidate onSubmit={handleSubmit} className="co-card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <Field label="Business name" name="businessName" required error={errors.businessName}>
        <input id="businessName" className={inputClass("businessName")} value={form.businessName} onChange={(event) => update("businessName", event.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.businessName)} aria-describedby={errors.businessName ? "businessName-error" : undefined} />
      </Field>
      <Field label="Your name" name="contactName" error={errors.contactName}>
        <input id="contactName" className={inputClass("contactName")} value={form.contactName} onChange={(event) => update("contactName", event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.contactName)} aria-describedby={errors.contactName ? "contactName-error" : undefined} />
      </Field>
      <Field label="Email" name="email" required error={errors.email}>
        <input id="email" type="email" className={inputClass("email")} value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
      </Field>
      <Field label="Crew size" name="crewSize" required error={errors.crewSize}>
        <select id="crewSize" className={inputClass("crewSize")} value={form.crewSize} onChange={(event) => update("crewSize", event.target.value)} aria-invalid={Boolean(errors.crewSize)} aria-describedby={errors.crewSize ? "crewSize-error" : undefined}>
          <option value="">Select crew size</option>
          <option value="1-5">1-5</option>
          <option value="6-15">6-15</option>
          <option value="16+">16+</option>
        </select>
      </Field>
      <Field label="Phone (only if you'd rather we call than email)" name="phone" error={errors.phone}>
        <input id="phone" type="tel" className={inputClass("phone")} value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} />
      </Field>
      <Field label="Message" name="message" error={errors.message}>
        <textarea id="message" rows={3} className={`${inputClass("message")} resize-y`} value={form.message} onChange={(event) => update("message", event.target.value)} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "message-error" : undefined} />
      </Field>
      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="company_website">Company website</label>
        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" value={form.companyWebsite} onChange={(event) => update("companyWebsite", event.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <ul className="mb-4 space-y-1.5 text-sm leading-6 text-[var(--co-muted)]">
          <li>No credit card, and no charge during beta.</li>
          <li>We won&apos;t call unless you tick the box below.</li>
          <li>Your data is yours: full CSV export any time, no lock-in.</li>
        </ul>
        <div className="min-h-16">
          {LEADS_TURNSTILE_SITE_KEY ? <Turnstile ref={turnstileRef} siteKey={LEADS_TURNSTILE_SITE_KEY} onSuccess={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => setCaptchaToken(null)} options={{ size: "flexible" }} /> : null}
        </div>
        {serverError ? <p role="alert" className="mb-3 text-sm text-rose-700">{serverError}</p> : null}
        <button type="submit" disabled={submitting} className="co-button-primary w-full sm:w-auto">
          {submitting ? "Sending…" : "Send my request"}
        </button>
      </div>
    </form>
  );
}

function Field({ children, error, label, name, required = false }: { children: React.ReactNode; error?: string; label: string; name: FieldName; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-[var(--co-ink)]" htmlFor={name}>
      {label}{required ? " *" : ""}
      {children}
      {error ? <span id={`${name}-error`} role="alert" className="mt-1 block text-xs font-normal text-rose-700">{error}</span> : null}
    </label>
  );
}
