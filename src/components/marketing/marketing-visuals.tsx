import Image from "next/image";

export function ProductScreenshot({ alt, chrome = true, height, priority = false, src, width }: { alt: string; chrome?: boolean; height: number; priority?: boolean; src: string; width: number }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] ${chrome ? "shadow-sm" : "shadow-[0_30px_60px_-25px_rgba(15,23,42,0.35)]"}`}>
      {chrome ? (
        <div className="flex h-9 items-center gap-1.5 border-b border-[var(--co-line-soft)] px-4" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
        </div>
      ) : null}
      <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 1024px) 576px, 100vw" className="h-auto w-full" />
    </div>
  );
}
