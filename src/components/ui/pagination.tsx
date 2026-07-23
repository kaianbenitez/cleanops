import Link from "next/link";

export function PaginationControls({
  page,
  pageSize,
  total,
  hrefForPage,
  itemLabel,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  itemLabel: string;
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
      ) : null}
    </div>
  );
}
