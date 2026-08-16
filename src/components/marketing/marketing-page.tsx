import Link from "next/link";
import { Check } from "lucide-react";
import LeadForm from "./lead-form";
import { MarketingFaq } from "./marketing-faq";
import { FeatureTabs } from "./feature-tabs";
import { FeatureBento } from "./feature-bento";
import { MobileShowcase } from "./mobile-showcase";
import { ProductScreenshot } from "./marketing-visuals";

const features = [
  ["Scheduling that stays ahead", "Plan work on a day, week, or month view, move assignments as things change, and keep recurring visits from slipping through.", "/marketing/scheduling.jpg"],
  ["A crew app for the workday", "Job details, entry codes, before/after photos, and how payment was collected. Cleaners see their whole schedule from their phone.", "/marketing/my-day-home.png"],
  ["Customer details in one record", "Keep service history, home notes, preferences, and safely masked access information close to every job.", "/marketing/customer-detail.jpg"],
  ["Quotes customers can accept online", "Create a branded proposal, share one clear link, and turn an approved quote into the next step without extra back-and-forth.", "/marketing/quote-proposal.jpg"],
  ["Built-in invoicing", "Create invoices in the same system you use to run the work, so the office does not have to juggle a separate tool to get paid.", "/marketing/invoicing.jpg"],
  ["Payroll tied to tracked time", "Use tiered hourly rates and commission support, with time tracking flowing straight into payroll runs.", "/marketing/payroll-team.jpg"],
] as const;

const steps = [
  "Tell us how your business works today. We reply within one business day, and it's a conversation, not a sales call.",
  "We help bring over your team, customers, and schedule.",
  "Try ServiceSpark with your crew in the day-to-day work.",
  "Tell us what would make it more useful as we build.",
] as const;

// Landing-page-only mark: cobalt + spark-orange, distinct from the app's
// "Pure Spark" sidebar/login badge (--spark-mark tokens, a separate
// deliberately-grey-blue mark tied to a real story), which is not touched here.
function SparkMark() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-9 w-9">
      <path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill="var(--co-accent)" />
      <path d="M32 12 L36 27 L51 32 L36 37 L32 52 L28 37 L13 32 L28 27 Z" fill="var(--co-spark-accent)" />
      <path d="M49 8 L51.4 14.6 L58 17 L51.4 19.4 L49 26 L46.6 19.4 L40 17 L46.6 14.6 Z" fill="var(--co-accent)" />
    </svg>
  );
}

export default function MarketingPage() {
  const year = new Date().getFullYear();
  return <main className="min-h-[100dvh] bg-[var(--co-bg)] text-[var(--co-ink)]">
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8" aria-label="Main navigation">
      <Link href="/" className="flex items-center gap-2.5" aria-label="ServiceSpark home">
        <SparkMark />
        <span className="text-lg font-semibold tracking-tight">ServiceSpark</span>
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/login" className="text-sm font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">
          Log in
        </Link>
        <a href="#join-beta" className="co-button-primary whitespace-nowrap">
          Join the beta
        </a>
      </div>
    </nav>

    <section className="bg-[linear-gradient(135deg,var(--co-accent-tint)_0%,var(--co-surface)_48%,var(--co-spark-accent-tint)_100%)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16 lg:px-8 lg:pt-16">
        <div className="marketing-hero-content">
          <p className="eyebrow text-[var(--co-accent)]">Cleaning business &amp; maid service software</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
            Run your cleaning business with less chasing.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--co-muted)]">
            One place for scheduling, crew handoffs, customers, quotes, invoicing, and payroll, built for cleaning companies with 2 to 30 cleaners.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#join-beta" className="co-button-primary px-5 py-3 text-sm">
              Get early access
            </a>
            <a href="#product" className="co-button-secondary px-5 py-3 text-sm">
              See how it works
            </a>
          </div>
        </div>
        <div className="marketing-hero-visual lg:-mr-6 xl:-mr-10">
          <ProductScreenshot
            src="/marketing/scheduling-calendar-crop.webp"
            alt="Three days of legible job cards on the ServiceSpark staff calendar"
            width={708}
            height={507}
            priority
            chrome={false}
          />
        </div>
      </div>
    </section>

    <section id="product" className="scroll-mt-6 bg-[var(--co-accent-tint)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:px-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">The cleaning business software your office and crew both trust.</h2>
          <ul className="mt-7 space-y-3 text-base font-medium leading-7">
            <li className="flex gap-3">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
              Spend less time chasing schedule changes.
            </li>
            <li className="flex gap-3">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
              Keep the small details from falling through the cracks.
            </li>
            <li className="flex gap-3">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
              Give your crew one clear place to see the day&apos;s work.
            </li>
            <li className="flex gap-3">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
              Handle billing without another piece of software.
            </li>
          </ul>
        </div>
        <figure>
          <ProductScreenshot
            src="/marketing/dashboard-revenue-crop.webp"
            alt="Weekly revenue and a performance figure from a real ServiceSpark cleaning business account"
            width={1231}
            height={608}
          />
          <figcaption className="mt-4 text-sm font-medium text-[var(--co-muted)]">Revenue and performance, without another piece of software.</figcaption>
        </figure>
      </div>
    </section>

    <section className="border-y border-[var(--co-line-soft)] bg-[var(--co-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">The operations work, connected.</h2>
          <p className="mt-3 leading-7 text-[var(--co-muted)]">The everyday tools your office and crew need, without stitching together a separate system for each job.</p>
        </div>
        <div className="mt-10">
          <FeatureTabs features={features} />
        </div>
      </div>
    </section>

    <MobileShowcase />

    <section className="bg-[var(--co-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">Everything else a growing crew needs.</h2>
          <p className="mt-3 leading-7 text-[var(--co-muted)]">Quality tracking, reporting, automation, and the day-to-day details that keep a bigger team organized.</p>
        </div>
        <div className="mt-10">
          <FeatureBento />
        </div>
      </div>
    </section>

    <section className="border-y border-[var(--co-line)] bg-[var(--co-surface-muted)]">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-semibold tracking-[-0.025em]">Questions, answered.</h2>
        <p className="mt-3 leading-7 text-[var(--co-muted)]">A few practical details about using ServiceSpark and joining the beta.</p>
        <div className="mt-8">
          <a href="#join-beta" className="co-button-primary">
            Try it with your crew
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 pb-20 text-left sm:px-6 lg:px-8">
        <MarketingFaq />
      </div>
    </section>

    <section id="join-beta" className="scroll-mt-6 border-y border-[var(--co-line)] bg-[linear-gradient(180deg,var(--co-surface-muted)_0%,var(--co-bg)_100%)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow text-[var(--co-accent)]">Founding cohort, free during beta</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-[var(--co-ink)]">Join the beta.</h2>
            <p className="mt-3 leading-7 text-[var(--co-muted)]">
              Tell us a little about your cleaning business, then try ServiceSpark with your real team and day-to-day work while we keep building it.
            </p>
            <ol className="mt-10 divide-y divide-[var(--co-line-soft)] border-y border-[var(--co-line-soft)]">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-4 py-5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--co-accent-tint)] text-xs font-semibold text-[var(--co-accent)]">
                    {index + 1}
                  </span>
                  <p className="font-medium leading-6 text-[var(--co-ink)]">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10">
              <LeadForm />
            </div>
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="co-card space-y-8 p-6 sm:p-8">
              <div>
                <p className="text-sm font-semibold text-[var(--co-accent)]">How early this actually is</p>
                <p className="mt-2 leading-7 text-[var(--co-muted)]">
                  ServiceSpark already runs full time on a real cleaning business: scheduling, customers, quotes, invoicing, payroll, all of it. What&apos;s brand new is opening it up to other businesses. You&apos;d be among the very first outside crews on it, early enough that what you ask for gets built, and early enough to hit the occasional rough edge. We&apos;d rather tell you that now than have you find out in week two.
                </p>
              </div>
              <div className="border-t border-[var(--co-line-soft)] pt-6">
                <p className="text-sm font-semibold text-[var(--co-accent)]">Who&apos;s building this</p>
                <p className="mt-2 leading-7 text-[var(--co-muted)]">
                  I&apos;m Kaian. I handle day-to-day operations for a real U.S. cleaning business, and I built ServiceSpark on the side because the scheduling and invoicing tools we were using never quite fit how a maid service actually runs. I work on it from Manila.
                </p>
              </div>
              <div className="border-t border-[var(--co-line-soft)] pt-6">
                <p className="text-sm font-semibold text-[var(--co-accent)]">Our guarantees</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--co-muted)]">
                  <li className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
                    No credit card, and no charge during beta.
                  </li>
                  <li className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
                    We won&apos;t call unless you tick the box.
                  </li>
                  <li className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--co-accent)]" strokeWidth={3} />
                    Your data is yours: full CSV export any time, no lock-in.
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <footer className="border-t border-[var(--co-line-soft)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-[var(--co-muted)] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <SparkMark />
            <span className="font-semibold text-[var(--co-ink)]">ServiceSpark</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/privacy-policy" className="hover:text-[var(--co-ink)]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-[var(--co-ink)]">
              Terms
            </Link>
            <a href="mailto:kbenitez1118@gmail.com" className="hover:text-[var(--co-ink)]">
              kbenitez1118@gmail.com
            </a>
          </div>
        </div>
        <div className="flex flex-col gap-1 border-t border-[var(--co-line-soft)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span>Manila, Philippines</span>
          <span>&copy; {year} ServiceSpark</span>
        </div>
      </div>
    </footer>
  </main>;
}
