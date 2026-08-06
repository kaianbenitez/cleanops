import Image from "next/image";
import Link from "next/link";
import LeadForm from "./lead-form";

const features = [
  ["Scheduling that stays ahead", "Plan work on a day, week, or month view, move assignments as things change, and keep recurring visits from slipping through.", "/marketing/scheduling.jpg"],
  ["A crew app for the workday", "Give cleaners job details, protected entry codes, checklists, photos, and a simple place to log what happened on site.", "/marketing/my-day.jpg"],
  ["Customer details in one record", "Keep service history, home notes, preferences, and safely masked access information close to every job.", "/marketing/customers.jpg"],
  ["Quotes customers can accept online", "Create a branded proposal, share one clear link, and turn an approved quote into the next step without extra back-and-forth.", "/marketing/quotes.jpg"],
  ["Built-in invoicing", "Create invoices in the same system you use to run the work, so the office does not have to juggle a separate tool to get paid.", "/marketing/invoicing.jpg"],
  ["Payroll tied to tracked time", "Use tiered hourly rates and commission support, with time tracking flowing straight into payroll runs.", "/marketing/payroll-team.jpg"],
] as const;

const steps = [
  "Tell us about your business.",
  "We set up your team, customers, and schedule.",
  "Dispatch and track every job from one place.",
  "Get paid faster with built-in invoicing.",
] as const;

function SparkMark() {
  return <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-9 w-9"><path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill="var(--spark-mark)"/><path d="M32 12 L36 27 L51 32 L36 37 L32 52 L28 37 L13 32 L28 27 Z" fill="var(--spark-mark-facet)"/><path d="M49 8 L51.4 14.6 L58 17 L51.4 19.4 L49 26 L46.6 19.4 L40 17 L46.6 14.6 Z" fill="var(--spark-mark)"/></svg>;
}

function ProductScreenshot({ alt, priority = false, src }: { alt: string; priority?: boolean; src: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-sm">
      <div className="flex h-9 items-center gap-1.5 border-b border-[var(--co-line-soft)] px-4" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
      </div>
      <Image src={src} alt={alt} width={1568} height={744} priority={priority} sizes="(min-width: 1024px) 576px, 100vw" className="h-auto w-full" />
    </div>
  );
}

export default function MarketingPage() {
  const year = new Date().getFullYear();

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--co-accent)_14%,transparent),transparent_36%),radial-gradient(circle_at_90%_28%,color-mix(in_srgb,var(--co-evergreen)_9%,transparent),transparent_32%),var(--co-bg)] text-[var(--co-ink)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2.5" aria-label="ServiceSpark home"><SparkMark /><span className="text-lg font-semibold tracking-tight">ServiceSpark</span></Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/login" className="text-sm font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">Log in</Link>
          <a href="#early-access" className="co-button-primary whitespace-nowrap">Request early access</a>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pt-28">
        <div className="max-w-3xl">
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">Run every cleaning job with less chasing and more clarity.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--co-muted)]">ServiceSpark brings scheduling, field work, customer records, quotes, invoices, payroll, and day-to-day visibility together for residential and commercial cleaning businesses.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#early-access" className="co-button-primary px-5 py-3 text-sm">Request early access</a>
            <Link href="/login" className="text-sm font-semibold text-[var(--co-muted)] underline decoration-[var(--co-line)] underline-offset-4 hover:text-[var(--co-ink)]">Log in</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <ProductScreenshot src="/marketing/dashboard.jpg" alt="ServiceSpark dashboard showing a cleaning business performance overview" priority />
        <p className="mt-5 max-w-3xl text-sm font-medium leading-6 text-[var(--co-muted)]">Not a concept — this is the same system a real cleaning business runs its day-to-day operations on.</p>
      </section>

      <section className="border-y border-[var(--co-line-soft)] bg-[color-mix(in_srgb,var(--co-surface)_82%,transparent)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.025em]">The operations work, connected.</h2><p className="mt-3 leading-7 text-[var(--co-muted)]">The essentials your office and crews need to keep a busy cleaning business moving.</p></div>
          <div className="mt-12 space-y-16 sm:mt-16 lg:space-y-24">
            {features.map(([title, description, screenshot], index) => (
              <article key={title} className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-14">
                <div className={index % 2 === 0 ? "order-2 lg:order-1" : "order-2"}>
                  <p className="font-mono text-sm font-semibold text-[var(--co-accent)]">0{index + 1}</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h3>
                  <p className="mt-4 max-w-xl leading-7 text-[var(--co-muted)]">{description}</p>
                </div>
                <div className={index % 2 === 0 ? "order-1 lg:order-2" : "order-1"}>
                  <ProductScreenshot src={screenshot} alt={`${title} in the ServiceSpark app`} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><h2 className="text-3xl font-semibold tracking-[-0.025em]">A practical path to a calmer day.</h2><p className="mt-3 max-w-md leading-7 text-[var(--co-muted)]">Start with the information you already use, then keep the office and the field team in step.</p></div><ol className="divide-y divide-[var(--co-line-soft)] border-y border-[var(--co-line-soft)]">{steps.map((step, index) => <li key={step} className="flex gap-5 py-5"><span className="font-mono text-sm font-semibold text-[var(--co-accent)]">0{index + 1}</span><p className="font-medium leading-6">{step}</p></li>)}</ol></div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8"><div className="rounded-xl border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-5 py-8 sm:px-8 sm:py-10"><div className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-[-0.025em]">Ready to spend less time coordinating the work?</h2><p className="mt-3 leading-7 text-[var(--co-muted)]">Tell us a little about your business and we&apos;ll be in touch about early access.</p><a href="#early-access" className="co-button-primary mt-6 px-5 py-3">Request early access</a></div></div></section>

      <section id="early-access" className="scroll-mt-6 border-t border-[var(--co-line-soft)] bg-[var(--co-surface)]"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"><div className="max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.025em]">Request early access</h2><p className="mt-3 leading-7 text-[var(--co-muted)]">We&apos;d love to learn how ServiceSpark could support your operation.</p></div><div className="mt-8 max-w-3xl"><LeadForm /></div></div></section>

      <footer className="border-t border-[var(--co-line-soft)]"><div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 text-sm text-[var(--co-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div className="flex items-center gap-2"><SparkMark /><span className="font-semibold text-[var(--co-ink)]">ServiceSpark</span></div><div className="flex items-center gap-5"><Link href="/privacy-policy" className="hover:text-[var(--co-ink)]">Privacy Policy</Link><span>© {year} ServiceSpark</span></div></div></footer>
    </main>
  );
}
