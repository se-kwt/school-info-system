import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-lg font-medium text-neutral-900">Page not found</p>
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
