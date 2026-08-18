export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  itemLabel,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between text-xs text-neutral-500">
      <p>{total === 0 ? `No ${itemLabel}` : `Showing ${start} to ${end} of ${total} ${itemLabel}`}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-40"
        >
          ‹
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-semibold text-white">
          {page}
        </span>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
