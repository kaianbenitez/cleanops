import Link from "next/link";

function buildPageList(page: number, totalPages: number): (number | "...")[] {
  const delta = 1;
  const middle: number[] = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) {
    middle.push(i);
  }
  const result: (number | "...")[] = [1];
  if (middle[0] > 2) result.push("...");
  result.push(...middle);
  if (middle.length && middle[middle.length - 1] < totalPages - 1) result.push("...");
  if (totalPages > 1) result.push(totalPages);
  return result;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  hrefForPage,
  itemLabel,
  variant = "text",
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  itemLabel: string;
  variant?: "text" | "pills";
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--co-line-soft)] px-5 py-3 text-xs text-[var(--co-muted)]">
      <span>
        Showing {start}-{end} of {total} {itemLabel}
        {total === 1 ? "" : "s"}
      </span>
      {totalPages > 1 ? (
        variant === "pills" ? (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={hrefForPage(page - 1)} aria-label="Previous page" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)]">
                ‹
              </Link>
            ) : (
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--co-line)] text-[var(--co-muted)] opacity-40">‹</span>
            )}
            {buildPageList(page, totalPages).map((entry, index) =>
              entry === "..." ? (
                <span key={`ellipsis-${index}`} className="px-1.5 text-[var(--co-muted)]">
                  …
                </span>
              ) : (
                <Link
                  key={entry}
                  href={hrefForPage(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    entry === page ? "bg-[var(--co-accent-fill)] text-white" : "border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)]"
                  }`}
                >
                  {entry}
                </Link>
              )
            )}
            {page < totalPages ? (
              <Link href={hrefForPage(page + 1)} aria-label="Next page" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--co-line)] bg-[var(--co-surface)] text-[var(--co-muted)] hover:border-[var(--co-accent-text)]">
                ›
              </Link>
            ) : (
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--co-line)] text-[var(--co-muted)] opacity-40">›</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={hrefForPage(page - 1)} className="co-button-secondary">
                Previous
              </Link>
            ) : (
              <span className="co-button-secondary opacity-40">Previous</span>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={hrefForPage(page + 1)} className="co-button-secondary">
                Next
              </Link>
            ) : (
              <span className="co-button-secondary opacity-40">Next</span>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
