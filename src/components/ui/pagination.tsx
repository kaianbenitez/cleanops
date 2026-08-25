import Link from "next/link";
import { PageSizeSelect } from "./page-size-select";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function parsePageSize(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : fallback;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  hrefForPage,
  itemLabel,
  basePath,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  itemLabel: string;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const filterParams: Record<string, string> = {};
  Object.entries(searchParams).forEach(([key, value]) => {
    if (key !== "page" && key !== "pageSize" && value) filterParams[key] = value;
  });

  const arrow = (label: string, symbol: string, target: number, enabled: boolean) =>
    enabled ? (
      <Link
        href={hrefForPage(target)}
        aria-label={label}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)] hover:text-[var(--co-ink)]"
      >
        {symbol}
      </Link>
    ) : (
      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--co-line)] text-[var(--co-muted)] opacity-40">
        {symbol}
      </span>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">
      <PageSizeSelect value={pageSize} options={PAGE_SIZE_OPTIONS} basePath={basePath} params={filterParams} />
      <div className="flex flex-wrap items-center gap-4">
        <span>
          Showing {start}-{end} of {total} {itemLabel}
          {total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          {arrow("First page", "«", 1, page > 1)}
          {arrow("Previous page", "‹", page - 1, page > 1)}
          <span className="flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--co-line)] bg-[var(--co-surface-muted)] px-2 font-semibold text-[var(--co-ink)]">
            {page}
          </span>
          {arrow("Next page", "›", page + 1, page < totalPages)}
          {arrow("Last page", "»", totalPages, page < totalPages)}
        </div>
      </div>
    </div>
  );
}
