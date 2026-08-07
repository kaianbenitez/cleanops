import Image from "next/image";

export function ProductScreenshot({ alt, height, priority = false, src, width }: { alt: string; height: number; priority?: boolean; src: string; width: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--co-line)] bg-[var(--co-surface)] shadow-sm">
      <div className="flex h-9 items-center gap-1.5 border-b border-[var(--co-line-soft)] px-4" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--co-line)]" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 1024px) 576px, 100vw" className="h-auto w-full" />
    </div>
  );
}
