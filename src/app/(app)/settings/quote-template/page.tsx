"use client";

import { useEffect, useMemo, useState } from "react";

type QuoteTemplate = {
  introLetter: string;
  terms: string;
  ownerName: string;
  ownerTitle: string;
  logoUrl: string;
  reviewUrl: string;
  beforePhotoUrl: string;
  afterPhotoUrl: string;
  photoSets: Array<{
    label: string;
    beforePhotoUrl: string;
    afterPhotoUrl: string;
  }>;
  insuranceUrl: string;
  w9Url: string;
  preferredDatePrompt: string;
  contactPhone: string;
};

const EMPTY: QuoteTemplate = {
  introLetter: "",
  terms: "",
  ownerName: "",
  ownerTitle: "",
  logoUrl: "",
  reviewUrl: "",
  beforePhotoUrl: "",
  afterPhotoUrl: "",
  photoSets: [
    { label: "Kitchen", beforePhotoUrl: "", afterPhotoUrl: "" },
    { label: "Bathroom", beforePhotoUrl: "", afterPhotoUrl: "" },
    { label: "Living area", beforePhotoUrl: "", afterPhotoUrl: "" },
  ],
  insuranceUrl: "",
  w9Url: "",
  preferredDatePrompt: "",
  contactPhone: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">{label}</span>
      {textarea ? (
        <textarea
          rows={6}
          className="co-input w-full resize-y leading-6"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input className="co-input w-full" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function AssetField({
  label,
  value,
  onChange,
  onUpload,
  placeholder,
  accept,
  uploading,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload: (file: File | null) => void | Promise<void>;
  placeholder?: string;
  accept?: string;
  uploading?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-xs font-semibold text-[var(--co-muted)]">{label}</span>
      <div className="space-y-2 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/35 p-3">
        <input className="co-input w-full" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="co-button-secondary cursor-pointer">
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept={accept}
              className="hidden"
              disabled={uploading}
              onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-[11px] leading-5 text-[var(--co-muted)]">Uploaded files are stored securely; only the link is saved here.</p>
        </div>
      </div>
    </label>
  );
}

function PreviewCard({ title, url, fallback }: { title: string; url: string; fallback: string }) {
  const hasUrl = Boolean(url.trim());
  const isImage = /^data:image\//.test(url) || /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(url);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)]">
      <div className="flex h-36 items-end bg-[var(--co-surface-muted)] p-4">
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--co-accent-text)]">{title}</span>
      </div>
      <div className="space-y-1 px-4 py-3">
        <p className="text-sm font-semibold text-[var(--co-ink)]">{hasUrl ? "Configured" : fallback}</p>
        {hasUrl ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-[var(--co-accent-text)] underline decoration-[var(--co-accent)] decoration-2 underline-offset-4"
          >
            Open {isImage ? "image" : "file"}
          </a>
        ) : (
          <p className="text-xs text-[var(--co-muted)]">Add a URL or upload a file for the proposal.</p>
        )}
      </div>
    </div>
  );
}

function PhotoSetCard({
  index,
  label,
  beforeUrl,
  afterUrl,
  onLabelChange,
  onBeforeChange,
  onAfterChange,
  onBeforeUpload,
  onAfterUpload,
  beforeUploading,
  afterUploading,
}: {
  index: number;
  label: string;
  beforeUrl: string;
  afterUrl: string;
  onLabelChange: (value: string) => void;
  onBeforeChange: (value: string) => void;
  onAfterChange: (value: string) => void;
  onBeforeUpload: (file: File | null) => void | Promise<void>;
  onAfterUpload: (file: File | null) => void | Promise<void>;
  beforeUploading?: boolean;
  afterUploading?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Photo set {index + 1}</p>
          <input
            className="mt-2 w-full border-0 bg-transparent p-0 text-base font-semibold text-[var(--co-ink)] outline-none ring-0 placeholder:text-[var(--co-muted)]"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder="Room or area label"
          />
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--co-accent-text)]">
          {beforeUrl || afterUrl ? "Ready" : "Empty"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AssetField
          label="Before photo"
          value={beforeUrl}
          onChange={onBeforeChange}
          onUpload={onBeforeUpload}
          placeholder="https://... or upload an image"
          accept="image/*"
          uploading={beforeUploading}
        />
        <AssetField
          label="After photo"
          value={afterUrl}
          onChange={onAfterChange}
          onUpload={onAfterUpload}
          placeholder="https://... or upload an image"
          accept="image/*"
          uploading={afterUploading}
        />
      </div>
    </div>
  );
}

async function uploadAsset(file: File, kind: "image" | "document") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  const response = await fetch("/api/settings/quote-assets", { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Upload failed.");
  return data.url as string;
}

export default function QuoteTemplateSettingsPage() {
  const [template, setTemplate] = useState<QuoteTemplate>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        const existing = data.company?.settings?.quoteTemplate as Partial<QuoteTemplate> | undefined;
        const existingPhotoSets = Array.isArray(existing?.photoSets) ? existing.photoSets : [];
        const photoSets =
          existingPhotoSets.length > 0
            ? existingPhotoSets.slice(0, 3).map((set, index) => ({
                label: set?.label ?? EMPTY.photoSets[index]?.label ?? `Photo set ${index + 1}`,
                beforePhotoUrl: set?.beforePhotoUrl ?? "",
                afterPhotoUrl: set?.afterPhotoUrl ?? "",
              }))
            : [
                {
                  label: existing?.beforePhotoUrl || existing?.afterPhotoUrl ? EMPTY.photoSets[0].label : "Kitchen",
                  beforePhotoUrl: existing?.beforePhotoUrl ?? "",
                  afterPhotoUrl: existing?.afterPhotoUrl ?? "",
                },
                { label: "Bathroom", beforePhotoUrl: "", afterPhotoUrl: "" },
                { label: "Living area", beforePhotoUrl: "", afterPhotoUrl: "" },
              ];
        setTemplate({ ...EMPTY, ...existing, photoSets: photoSets.length ? photoSets : EMPTY.photoSets });
        setLoading(false);
      })
      .catch(() => {
        setMessage("Could not load quote content.");
        setLoading(false);
      });
  }, []);

  const hasTrustAssets = useMemo(
    () =>
      Boolean(
        template.logoUrl ||
          template.reviewUrl ||
          template.beforePhotoUrl ||
          template.afterPhotoUrl ||
          template.photoSets.some((set) => set.beforePhotoUrl || set.afterPhotoUrl) ||
          template.insuranceUrl ||
          template.w9Url
      ),
    [template.afterPhotoUrl, template.beforePhotoUrl, template.insuranceUrl, template.logoUrl, template.photoSets, template.reviewUrl, template.w9Url]
  );

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteTemplate: template }),
    });
    setSaving(false);
    setMessage(response.ok ? "Quote content saved." : "Could not save quote content.");
  }

  const update = (field: keyof QuoteTemplate, value: string) => setTemplate((current) => ({ ...current, [field]: value }));

  async function withUploading(key: string, run: () => Promise<void>) {
    setUploadingKeys((current) => new Set(current).add(key));
    setMessage("");
    try {
      await run();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function upload(field: keyof QuoteTemplate, kind: "image" | "document", file: File | null) {
    if (!file) return;
    await withUploading(field, async () => {
      const url = await uploadAsset(file, kind);
      update(field, url);
      setMessage(`${file.name} attached.`);
    });
  }

  function updatePhotoSet(index: number, field: "label" | "beforePhotoUrl" | "afterPhotoUrl", value: string) {
    setTemplate((current) => {
      const next = [...current.photoSets];
      const existing = next[index] ?? { label: `Photo set ${index + 1}`, beforePhotoUrl: "", afterPhotoUrl: "" };
      next[index] = { ...existing, [field]: value };
      return { ...current, photoSets: next };
    });
  }

  async function uploadPhotoSet(index: number, field: "beforePhotoUrl" | "afterPhotoUrl", file: File | null) {
    if (!file) return;
    await withUploading(`photoSet-${index}-${field}`, async () => {
      const url = await uploadAsset(file, "image");
      updatePhotoSet(index, field, url);
      setMessage(`${file.name} attached.`);
    });
  }

  if (loading) return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading quote content…</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Pricing & quoting</p>
        <h1 className="page-title mt-2">Quote page content</h1>
        <p className="page-subtitle">Shape the introduction, trust blocks, and links customers see on every proposal.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="co-card p-5">
          <p className="eyebrow">Proposal copy</p>
          <h2 className="mt-1 text-lg font-semibold">Customer-facing content</h2>

          <div className="mt-5 grid gap-4">
            <Field
              label="Intro letter"
              value={template.introLetter}
              onChange={(value) => update("introLetter", value)}
              textarea
              placeholder="Thank you for considering our cleaning service..."
            />
            <Field
              label="Terms & conditions"
              value={template.terms}
              onChange={(value) => update("terms", value)}
              textarea
              placeholder="Cancellation terms, payment expectations, and service notes..."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Signed by" value={template.ownerName} onChange={(value) => update("ownerName", value)} placeholder="Owner name" />
              <Field label="Owner title" value={template.ownerTitle} onChange={(value) => update("ownerTitle", value)} placeholder="Owner / Operations Manager" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <AssetField
                label="Quote logo"
                value={template.logoUrl}
                onChange={(value) => update("logoUrl", value)}
                onUpload={(file) => upload("logoUrl", "image", file)}
                placeholder="https://... or upload an image"
                accept="image/*"
                uploading={uploadingKeys.has("logoUrl")}
              />
              <Field label="Company phone on quote" value={template.contactPhone} onChange={(value) => update("contactPhone", value)} placeholder="(555) 123-4567" />
            </div>

            <Field label="Preferred date prompt" value={template.preferredDatePrompt} onChange={(value) => update("preferredDatePrompt", value)} placeholder="Tell us your preferred start date..." />

            <div className="space-y-4">
              <div className="rounded-3xl border border-[var(--co-line-soft)] bg-[var(--co-surface-muted)]/25 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">Before / after gallery</p>
                <h3 className="mt-2 text-lg font-semibold">Three visual proof sets</h3>
                <p className="mt-1 text-sm text-[var(--co-muted)]">Use these for the kitchen, bathroom, living area, or any rooms you want customers to compare at a glance.</p>
              </div>
              <div className="space-y-4">
                {template.photoSets.slice(0, 3).map((set, index) => (
                  <PhotoSetCard
                    key={`${index}-${set.label}`}
                    index={index}
                    label={set.label}
                    beforeUrl={set.beforePhotoUrl}
                    afterUrl={set.afterPhotoUrl}
                    onLabelChange={(value) => updatePhotoSet(index, "label", value)}
                    onBeforeChange={(value) => updatePhotoSet(index, "beforePhotoUrl", value)}
                    onAfterChange={(value) => updatePhotoSet(index, "afterPhotoUrl", value)}
                    onBeforeUpload={(file) => uploadPhotoSet(index, "beforePhotoUrl", file)}
                    onAfterUpload={(file) => uploadPhotoSet(index, "afterPhotoUrl", file)}
                    beforeUploading={uploadingKeys.has(`photoSet-${index}-beforePhotoUrl`)}
                    afterUploading={uploadingKeys.has(`photoSet-${index}-afterPhotoUrl`)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AssetField
                label="Insurance certificate (JPG/PDF)"
                value={template.insuranceUrl}
                onChange={(value) => update("insuranceUrl", value)}
                onUpload={(file) => upload("insuranceUrl", "document", file)}
                placeholder="https://... or upload a JPG/PDF"
                accept="image/*,.pdf,application/pdf"
                uploading={uploadingKeys.has("insuranceUrl")}
              />
              <AssetField
                label="W-9"
                value={template.w9Url}
                onChange={(value) => update("w9Url", value)}
                onUpload={(file) => upload("w9Url", "image", file)}
                placeholder="https://... or upload an image"
                accept="image/*"
                uploading={uploadingKeys.has("w9Url")}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--co-muted)]">Blank fields use the built-in ServiceSpark defaults.</p>
            <button onClick={save} disabled={saving} className="co-button-primary">
              {saving ? "Saving…" : "Save quote content"}
            </button>
          </div>
          {message ? <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{message}</p> : null}
        </section>

        <aside className="space-y-5">
          <section className="co-card h-fit bg-[var(--co-accent-fill)] p-5 text-white xl:sticky xl:top-5">
            <p className="eyebrow text-white/50">Preview</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Your cleaning proposal</h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/70">{template.introLetter || "Your introduction will appear here when a customer opens a proposal."}</p>
            {template.logoUrl ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Quote logo</p>
                <div className="mt-3 flex h-16 items-center justify-center overflow-hidden rounded-xl bg-white/95">
                  <img src={template.logoUrl} alt="Quote logo preview" className="h-full w-full object-contain p-2" />
                </div>
              </div>
            ) : null}
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">Prepared by</p>
              <p className="mt-2 font-medium">{template.ownerName || "Your company"}</p>
              <p className="text-sm text-white/60">{template.ownerTitle || "Operations"}</p>
            </div>
          </section>

          <section className="co-card p-5">
            <p className="eyebrow">Gallery preview</p>
            <h3 className="mt-1 text-lg font-semibold">Before / after sets</h3>
            <p className="mt-1 text-sm text-[var(--co-muted)]">The quote page will show up to three comparison sets from the photos you upload here.</p>
            <div className="mt-4 grid gap-3">
              {template.photoSets.slice(0, 3).map((set, index) => (
                <div key={`${set.label}-${index}`} className="rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--co-muted)]">{set.label || `Photo set ${index + 1}`}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <PreviewCard title="Before" url={set.beforePhotoUrl} fallback="No before photo" />
                    <PreviewCard title="After" url={set.afterPhotoUrl} fallback="No after photo" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="co-card p-5">
            <p className="eyebrow">Trust assets</p>
            <h3 className="mt-1 text-lg font-semibold">Insurance and W-9</h3>
            <p className="mt-1 text-sm text-[var(--co-muted)]">These stay available for the proposal and can be uploaded directly here.</p>
            <div className="mt-4 grid gap-3">
              <PreviewCard title="Insurance certificate" url={template.insuranceUrl} fallback="No insurance link" />
              <PreviewCard title="W-9" url={template.w9Url} fallback="No W-9 link" />
            </div>
            <p className="mt-4 text-xs text-[var(--co-muted)]">
              {hasTrustAssets ? "Trust assets are ready for the proposal page." : "Add links now, or upload files above."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
