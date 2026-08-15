export default function TermsPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <p className="eyebrow">Legal</p>
        <h1 className="page-title mt-2">Terms of Service</h1>
        <p className="page-subtitle">The terms for using ServiceSpark, provided by Simply Maid LLC.</p>
      </div>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Acceptance of Terms</h2>
        <p>
          By signing in to or using ServiceSpark, you agree to these terms. ServiceSpark is the internal operations platform Simply Maid LLC provides to its admins and field staff to manage customers, jobs, scheduling, payroll, and invoicing. If you don&apos;t agree to these terms, don&apos;t use ServiceSpark.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Active Beta</h2>
        <p>
          ServiceSpark is under active development and is subject to change. Features may be added, changed, or removed, and the way things look or work today may be different tomorrow. We&apos;ll do our best to avoid disrupting your work, but as a beta product, things may occasionally break or shift without much notice.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Your Data</h2>
        <p>
          You own the customer, job, payroll, and other business data your company enters into ServiceSpark. We don&apos;t sell it or use it for anything other than operating the platform for you. You can request a full CSV export of your company&apos;s data at any time, and there&apos;s no lock-in — if you decide to stop using ServiceSpark, your data is yours to take with you.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">No Warranty</h2>
        <p>
          During this beta period, ServiceSpark is provided &quot;as is,&quot; without warranty of any kind, express or implied. We work hard to keep it reliable, but we can&apos;t guarantee it will always be available, accurate, or error-free.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Changes to These Terms</h2>
        <p>
          We may update these terms as ServiceSpark changes. If we make a material change, we&apos;ll let company administrators know.
        </p>
      </section>

      <section className="co-card space-y-3 p-5 text-sm leading-6 text-[var(--co-muted)]">
        <h2 className="text-lg font-semibold text-[var(--co-ink)]">Contact</h2>
        <p>
          Questions about these terms should go to <a href="mailto:kbenitez1118@gmail.com" className="text-[var(--co-ink)] underline hover:no-underline">kbenitez1118@gmail.com</a>.
        </p>
      </section>
    </div>
  );
}
