import Link from "next/link";
import LeadForm from "./lead-form";
import { MarketingFaq } from "./marketing-faq";
import { FeatureStack } from "./feature-stack";
import { ProductScreenshot } from "./marketing-visuals";

const features = [
  ["Scheduling that stays ahead", "Plan work on a day, week, or month view, move assignments as things change, and keep recurring visits from slipping through.", "/marketing/scheduling.jpg", "right center"],
  ["A crew app for the workday", "Give cleaners job details, protected entry codes, checklists, photos, and a simple place to log what happened on site.", "/marketing/my-day-mobile.png", "center"],
  ["Customer details in one record", "Keep service history, home notes, preferences, and safely masked access information close to every job.", "/marketing/customers.jpg", "center top"],
  ["Quotes customers can accept online", "Create a branded proposal, share one clear link, and turn an approved quote into the next step without extra back-and-forth.", "/marketing/quotes.jpg", "center top"],
  ["Built-in invoicing", "Create invoices in the same system you use to run the work, so the office does not have to juggle a separate tool to get paid.", "/marketing/invoicing.jpg", "center top"],
  ["Payroll tied to tracked time", "Use tiered hourly rates and commission support, with time tracking flowing straight into payroll runs.", "/marketing/payroll-team.jpg", "left top"],
] as const;

const steps = ["Tell us how your business works today.", "We help bring over your team, customers, and schedule.", "Try ServiceSpark with your crew in the day-to-day work.", "Tell us what would make it more useful as we build."] as const;

function SparkMark() {
  return <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-9 w-9"><path d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z" fill="var(--spark-mark)"/><path d="M32 12 L36 27 L51 32 L36 37 L32 52 L28 37 L13 32 L28 27 Z" fill="var(--spark-mark-facet)"/><path d="M49 8 L51.4 14.6 L58 17 L51.4 19.4 L49 26 L46.6 19.4 L40 17 L46.6 14.6 Z" fill="var(--spark-mark)"/></svg>;
}

export default function MarketingPage() {
  const year = new Date().getFullYear();
  return <main className="min-h-[100dvh] bg-[var(--co-bg)] text-[var(--co-ink)]">
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8" aria-label="Main navigation">
      <Link href="/" className="flex items-center gap-2.5" aria-label="ServiceSpark home"><SparkMark /><span className="text-lg font-semibold tracking-tight">ServiceSpark</span></Link>
      <div className="flex items-center gap-3 sm:gap-5"><Link href="/login" className="text-sm font-semibold text-[var(--co-muted)] hover:text-[var(--co-ink)]">Log in</Link><a href="#join-beta" className="co-button-primary whitespace-nowrap">Join the beta — it&apos;s free</a></div>
    </nav>

    <section className="bg-[linear-gradient(135deg,#edf3ff_0%,#f7f9ff_48%,var(--co-spark-accent-tint)_100%)]"><div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-28">
      <div className="marketing-hero-content"><h1 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl lg:text-6xl">Run every cleaning job with less chasing and more clarity.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--co-muted)]">ServiceSpark keeps scheduling, crew work, customer records, quotes, invoices, and payroll in one place for cleaning businesses that are tired of piecing it together.</p><div className="mt-8 flex flex-wrap items-center gap-3"><a href="#join-beta" className="co-button-primary px-5 py-3 text-sm">Join the beta — it&apos;s free</a><Link href="/login" className="text-sm font-semibold text-[var(--co-muted)] underline decoration-[var(--co-line)] underline-offset-4 hover:text-[var(--co-ink)]">Log in</Link></div></div>
      <div className="marketing-hero-visual"><ProductScreenshot src="/marketing/scheduling.jpg" alt="ServiceSpark staff calendar for a cleaning business" width={1568} height={744} priority /><p className="mt-5 text-sm font-medium leading-6 text-[var(--co-muted)]">This is the product beta testers use — built around the jobs, changes, and handoffs that actually fill a cleaning day.</p></div>
    </div></section>

    <section className="bg-[#f1f5ff]"><div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:px-8"><div><h2 className="text-3xl font-semibold tracking-[-0.025em]">How ServiceSpark helps you</h2><ul className="mt-7 space-y-4 text-lg font-medium leading-7"><li>Spend less time chasing schedule changes.</li><li>Keep the small details from falling through the cracks.</li><li>Give your crew one clear place to see the day&apos;s work.</li><li>Handle billing without another piece of software.</li></ul></div><figure><ProductScreenshot src="/marketing/dashboard.jpg" alt="ServiceSpark dashboard showing a cleaning business performance overview" width={1568} height={744} /><figcaption className="mt-4 text-sm font-medium text-[var(--co-muted)]">A simple view of what needs attention across the business.</figcaption></figure></div></section>

    <section className="border-y border-[var(--co-line-soft)] bg-[#e8f0ff]"><div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"><div className="max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.025em]">The operations work, connected.</h2><p className="mt-3 leading-7 text-[var(--co-muted)]">The everyday tools your office and crew need, without stitching together a separate system for each job.</p></div><div className="mt-10"><FeatureStack features={features} /></div></div></section>

    <section className="border-y border-[var(--co-line)] bg-[var(--co-surface-muted)]"><div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16 lg:px-8"><div><h2 className="text-3xl font-semibold tracking-[-0.025em]">Questions, answered.</h2><p className="mt-3 leading-7 text-[var(--co-muted)]">A few practical details about using ServiceSpark.</p></div><MarketingFaq /></div></section>

    <section id="join-beta" className="scroll-mt-6 bg-[var(--co-accent)] text-white"><div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8"><div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><h2 className="text-3xl font-semibold tracking-[-0.025em]">Join the beta — it&apos;s free.</h2><p className="mt-3 max-w-md leading-7 text-[var(--co-on-dark-accent)]">Start with the information you already use, then test the product with your team while we keep building it.</p></div><ol className="divide-y divide-white/25 border-y border-white/25">{steps.map((step, index) => <li key={step} className="flex gap-5 py-5"><span className="font-mono text-sm font-semibold text-[var(--co-on-dark-accent)]">0{index + 1}</span><p className="font-medium leading-6">{step}</p></li>)}</ol></div><div className="mt-14 border-t border-white/25 pt-12"><div className="max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.025em]">Join the beta — it&apos;s free.</h2><p className="mt-3 leading-7 text-[var(--co-on-dark-accent)]">Tell us a little about your cleaning business. We&apos;ll help you get set up and would love your honest feedback as we build.</p><h3 className="mt-8 text-xl font-semibold">Join the beta — it&apos;s free</h3><p className="mt-2 leading-7 text-[var(--co-on-dark-accent)]">There&apos;s no charge during beta — just a chance to try it with your real day-to-day work.</p></div><div className="mt-8 max-w-3xl"><LeadForm /></div></div></div></section>

    <footer className="border-t border-[var(--co-line-soft)]"><div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 text-sm text-[var(--co-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div className="flex items-center gap-2"><SparkMark /><span className="font-semibold text-[var(--co-ink)]">ServiceSpark</span></div><div className="flex items-center gap-5"><Link href="/privacy-policy" className="hover:text-[var(--co-ink)]">Privacy Policy</Link><span>&copy; {year} ServiceSpark</span></div></div></footer>
  </main>;
}
