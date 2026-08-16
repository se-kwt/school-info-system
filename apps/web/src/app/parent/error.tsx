"use client";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <p className="text-sm text-neutral-600">Something went wrong loading this page.</p>
      <button
        onClick={reset}
        className="rounded border border-neutral-200 px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-50"
      >
        Try again
      </button>
    </div>
  );
}
