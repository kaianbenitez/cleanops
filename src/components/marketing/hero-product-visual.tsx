import Image from "next/image";
import { TrendingUp, Wallet } from "lucide-react";

function StatusCard({ icon, eyebrow, title, meta, tone = "accent" }: { icon: React.ReactNode; eyebrow: string; title: string; meta?: string; tone?: "accent" | "success" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-4 py-3 shadow-[0_16px_32px_-16px_rgba(15,23,42,0.18)]">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone === "success" ? "bg-[var(--co-success-bg)] text-[var(--co-success)]" : "bg-[var(--co-accent-tint)] text-[var(--co-accent)]"}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--co-faint)]">{eyebrow}</p>
        <p className="text-sm font-semibold text-[var(--co-ink)]">{title}</p>
        {meta ? <p className="text-xs font-medium text-[var(--co-muted)]">{meta}</p> : null}
      </div>
    </div>
  );
}

/** hero-composite.jpg is a single pre-composed asset (calendar + crew phone, matched
 * background and shadow already baked in) — rendered flat, no extra frame/rotation
 * layered on top, so its own edges stay seamless against the section background. */
export function HeroProductVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] pb-10 pt-4 sm:max-w-[620px] sm:pb-12 lg:max-w-none lg:pb-14">
      <Image
        src="/marketing/hero-composite.jpg"
        alt="ServiceSpark scheduling calendar and the My Day crew app showing a cleaner's next stop"
        width={1448}
        height={1086}
        priority
        sizes="(min-width: 1024px) 780px, (min-width: 640px) 640px, 100vw"
        className="h-auto w-full"
      />

      <div className="marketing-hero-cards absolute -bottom-10 left-0 flex flex-col gap-2.5 sm:-bottom-12 sm:gap-3 lg:-left-4 lg:-bottom-10">
        <StatusCard
          icon={<TrendingUp className="h-4 w-4" strokeWidth={2.25} />}
          eyebrow="Weekly revenue"
          title="$4,075"
          meta="↑ 12% vs last week"
        />
        <StatusCard
          icon={<Wallet className="h-4 w-4" strokeWidth={2.25} />}
          eyebrow="Payroll status"
          title="Payroll ready"
          meta="Paid Friday morning"
          tone="success"
        />
      </div>
    </div>
  );
}

export { StatusCard };
